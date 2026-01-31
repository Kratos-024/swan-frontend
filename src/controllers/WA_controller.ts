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
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
function savePdfFromBase64(pdf_b64: string, filePath: string) {
  const pdfBuffer = Buffer.from(pdf_b64, "base64");
  fs.writeFileSync(filePath, pdfBuffer);
}

export type AuthType = {
  auth: boolean;
  url_string: string;
};
ffmpeg.setFfmpegPath(ffmpegPath.path);
const outStream = fs.createWriteStream("./output.mp3");
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

const startBot = async (MOBILE_NUMBER: string) => {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const socket = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
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
      console.log("Audio error:", error);
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
          else console.log("QR in qrcode.png");
        });
      }
      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        if (shouldReconnect) {
          startBot(MOBILE_NUMBER);
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
    if (key.fromMe) return;

    try {
      if (key.remoteJid == `${MOBILE_NUMBER}@s.whatsapp.ne`) {
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
          await socket.sendMessage(key.remoteJid, {
            text: "Saving the pdf wait for the confirmation...",
          });
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
              text: `${response?.reply || "PDF Processed."}`,
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
          ) {
            await socket.sendMessage(key.remoteJid, {
              text: response["reply"],
            });
          }
        } else {
          const text =
            msgContent.conversation || msgContent.extendedTextMessage?.text;

          if (text) {
            const trimmedText = text.trim();
            if (trimmedText.startsWith("/img")) {
              const response = await sendImgQuery(trimmedText);
              if (
                response &&
                typeof response == "object" &&
                "imageResponse" in response
              ) {
                const imgRes = response.imageResponse;
                if (imgRes.toString().length > 100) {
                  const img_buffer_ = Buffer.from(
                    response.imageResponse,
                    "base64",
                  );
                  await socket.sendMessage(key.remoteJid, {
                    image: img_buffer_,
                    caption: "Here is your result",
                  });
                } else {
                  await socket.sendMessage(key.remoteJid, {
                    text: imgRes.toString(),
                  });
                }
              } else if (
                response &&
                typeof response == "object" &&
                "auth" in response
              ) {
                await socket.sendMessage(key.remoteJid, {
                  text: response["url_string"],
                });
              }
            } else if (trimmedText.startsWith("/pdf")) {
              const response = await search_pdf(trimmedText);

              if (
                response &&
                Array.isArray(response["reply"]) &&
                response["reply"].length > 0
              ) {
                for (let pdf of response["reply"]) {
                  if (pdf.cover_buffer) {
                    const img_buffer_ = Buffer.from(pdf.cover_buffer, "base64");

                    await socket.sendMessage(key.remoteJid, {
                      image: img_buffer_,
                      caption: `Name: ${pdf.File_Name}, Date ${pdf.date}, Total pages: ${pdf.total_pages}`,
                    });
                  } else {
                    await socket.sendMessage(key.remoteJid, {
                      text: `*PDF Found Name: ${pdf.File_Name} \nDate: ${pdf.date}\nTotal pages: ${pdf.total_pages}`,
                    });
                  }
                }
              } else if (
                response &&
                response["reply"] &&
                "pdf_name" in response &&
                typeof response["reply"] == "string" &&
                typeof response["pdf_name"] == "string"
              ) {
                savePdfFromBase64(response["reply"], response["pdf_name"]);
                await socket.sendMessage(key.remoteJid, {
                  document: { url: response["pdf_name"] },
                  mimetype: "application/pdf",
                  fileName: response["pdf_name"],
                });
                fs.rm(response["pdf_name"], (err) => {
                  console.log(
                    "deleted successyfkklkjgsjk",
                    response["pdf_name"],
                  );
                });
              } else {
                await socket.sendMessage(key.remoteJid, {
                  text: `No pdf were found`,
                });
              }
            } else if (trimmedText.startsWith("/help")) {
              socket.sendMessage(key.remoteJid, {
                text: `🤖 *Bot Commands Overview*:

1. /img [search query]  
   - Retrieve images you previously sent to the bot that match the query.

2. /pdf [search query]  
   - Retrieve PDFs you previously sent to the bot that match the query.

3. Send a PDF or Image  
   - Upload a PDF or image and the bot will save it for future retrieval.

4. Send a text message  
   - Ask any question and get a response from the AI.

💡 *Tip:* Anything you send (PDFs or images) can be retrieved later using a query.`,
              });
            } else {
              const response = await sendTextMessage(trimmedText);

              if (response && "reply" in response) {
                socket.sendMessage(key.remoteJid, {
                  text: response["reply"],
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in messages.upsert:", error);
    }
  });
};

export default startBot;
