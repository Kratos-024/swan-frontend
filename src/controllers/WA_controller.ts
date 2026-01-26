import {
  useMultiFileAuthState,
  makeWASocket,
  Browsers,
  type BaileysEventMap,
  DisconnectReason,
  downloadMediaMessage,
  type WAMessage,
} from "@whiskeysockets/baileys";
import P from "pino";
import QRCode from "qrcode";
import NodeCache from "node-cache";
import BOOM, { Boom } from "@hapi/boom";
import { sendTextMessage } from "./messages_controller.js";
import fs, { type WriteFileOptions } from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
ffmpeg.setFfmpegPath(ffmpegPath.path);
const outStream = fs.createWriteStream("./output.mp3");
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const socket = makeWASocket({
    auth: state,
    logger: P(),
    browser: Browsers.windows("Chrome"),
    qrTimeout: 10000,
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
    syncFullHistory: false,
  });
  const getAudio = async (message: WAMessage) => {
    try {
      const buffer = await downloadMediaMessage(
        message,
        "buffer",
        {},
        {
          logger: P(),
          reuploadRequest: socket.updateMediaMessage,
        },
      );
      fs.writeFileSync("audios/voice_note.ogg", buffer);
      ffmpeg()
        .input("./audios/voice_note.ogg")
        .audioQuality(96)
        .toFormat("mp3")
        .on("error", (error: { message: any }) => {
          console.error(`Encoding Error: ${error.message}`);
        })
        .on("end", () => {
          console.log("Audio Transcoding succeeded!");
        })

        .pipe(outStream, { end: true });
    } catch (error) {
      console.log(error);
    }
  };
  socket.ev.on("creds.update", saveCreds);
  socket.ev.on(
    "connection.update",
    async (update: BaileysEventMap["connection.update"]) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        QRCode.toFile("qrcode.png", qr, (err) => {
          if (err) console.error("Failed to save QR:", err);
          else console.log("QR Code generated in qrcode.png");
        });
      }
      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        console.log(
          "Connection closed due to ",
          lastDisconnect?.error,
          ", reconnecting: ",
          shouldReconnect,
        );

        if (shouldReconnect) {
          startBot();
        }
      } else if (connection === "open") {
        console.log("Opened connection successfully!");
      }
    },
  );

  socket.ev.on("messages.upsert", async (even_messages) => {
    const { messages, type, requestId } = even_messages;
    const key = messages[0]?.key;
    const message = messages[0];
    try {
      if (message) {
        if (message.message?.audioMessage) {
          await getAudio(message);
        } else if (
          message.message?.documentMessage &&
          message.message.documentMessage.mimetype == "application/pdf"
        ) {
          const fileMessage = message.message.documentMessage;
          const file_buffer = await downloadMediaMessage(
            message,
            "buffer",
            {},
            {
              logger: P(),
              reuploadRequest: socket.updateMediaMessage,
            },
          );
          fs.writeFile("output.pdf", file_buffer, (err) => {
            if (err) throw err;
            console.log("PDF file has been saved!");
          });
        } else if (message.message?.imageMessage) {
          const image = message.message.imageMessage;
          const img_buffer = await downloadMediaMessage(
            message,
            "buffer",
            {},
            {
              logger: P(),
              reuploadRequest: socket.updateMediaMessage,
            },
          );
          fs.writeFile("image.png", img_buffer, (err) => {
            if (err) throw err;
            console.log("image saved successfully");
          });
        } else if (message.message?.conversation) {
          if (!key?.remoteJid) {
            return;
          }
          const reply = sendTextMessage(message?.message?.conversation);
          socket.sendMessage(key.remoteJid, { text: (await reply) || "" });
        }
      }
    } catch (error) {
      console.log(error);
    }
  });
};

export default startBot;
