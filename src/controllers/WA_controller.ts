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
import { Boom } from "@hapi/boom";
import {
  search_pdf,
  sendImgMessage,
  sendImgQuery,
  sendPdfToDrive,
  sendTextMessage,
} from "./messages_controller.js";
import fs, { type WriteFileOptions } from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
export type AuthType = {
  auth: boolean;
  url_string: string;
};
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

  socket.ev.on("messages.upsert", async ({ messages }) => {
    const message = messages[0];
    if (!message?.message) return;

    const key = message.key;
    if (!key?.remoteJid) return;

    try {
      const msgContent = message.message;

      const downloadBuffer = async () => {
        return await downloadMediaMessage(
          message,
          "buffer",
          {},
          { logger: P(), reuploadRequest: socket.updateMediaMessage },
        );
      };

      if (msgContent.audioMessage) {
        await getAudio(message);
      } else if (msgContent.documentMessage?.mimetype === "application/pdf") {
        const file_buffer = await downloadBuffer();
        const response = await sendPdfToDrive(
          file_buffer,
          msgContent.documentMessage?.fileName || "my_pdf.pdf",
        );

        if (response && typeof response === "object" && "auth" in response) {
          if (response.auth === false) {
            await socket.sendMessage(key.remoteJid, {
              text: `Please authorize here: ${response.url_string}`,
            });
          }
        } else {
          await socket.sendMessage(key.remoteJid, {
            text: `${response?.reply}`,
          });
        }
      } else if (msgContent.imageMessage) {
        const img_buffer = await downloadBuffer();
        const response = await sendImgMessage(img_buffer);
        if (response && typeof response === "object" && "auth" in response) {
          if (response.auth === false) {
            await socket.sendMessage(key.remoteJid, {
              text: `Please authorize here: ${response.url_string}`,
            });
          }
        } else if (
          response &&
          typeof response === "object" &&
          "reply" in response
        )
          await socket.sendMessage(key.remoteJid, { text: response["reply"] });
      } else {
        const text = msgContent.conversation;

        if (text) {
          if (text.includes("/img")) {
            const response = await sendImgQuery(text);
            if (
              response &&
              typeof response == "object" &&
              "imageResponse" in response
            ) {
              const img_buffer_ = Buffer.from(
                //@ts-ignore
                response["imageResponse"],
                "base64",
              );

              await socket.sendMessage(key.remoteJid, {
                image: img_buffer_,
                caption: "Here is your result",
              });

              // } else {
              //   const reply = await sendTextMessage(text);
              //   if (reply) {
              //     await socket.sendMessage(key.remoteJid, { text: reply });
              //   }
            }
          } else if (text.includes("/pdf")) {
            const response = await search_pdf(text);
            console.log(response);
            if (response && response.length > 0) {
              for (let pdf of response) {
                await socket.sendMessage(key.remoteJid, {
                  text: `${pdf.File_Name}`,
                });
              }
            } else
              await socket.sendMessage(key.remoteJid, {
                text: `No pdf were found`,
              });
          }
        }
      }
    } catch (error) {
      console.error("Error in messages.upsert:", error);
    }
  });
};

export default startBot;
