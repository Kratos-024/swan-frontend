const URI = "http://127.0.0.1:8000";
import type { WithImplicitCoercion } from "buffer";

type ImageEmbed = {
  reply: string;
};
export type AuthType = {
  auth: boolean;
  url_string: string;
};
type ImagePdfEmbedResponse = ImageEmbed | AuthType;

type BufferResponse = {
  imageResponse: string | WithImplicitCoercion<string>;
};
type SimpleTextMessage = {
  reply: string;
};

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export async function baseRequest<TResponse>(
  URI: string,
  method: HttpMethod,
  headers?: Record<string, string>,
  body?: unknown,
): Promise<TResponse> {
  const init = {
    method,
    headers,
  } as RequestInit;

  if (body !== undefined) {
    init.body = body instanceof FormData ? body : JSON.stringify(body);
  }
  const response = await fetch(URI, init);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

const sendTextMessage = async (message: string) => {
  try {
    const response = await baseRequest<SimpleTextMessage>(
      `${URI}/chat`,
      "POST",
      { "content-Type": "application/json" },
      { message, thread_id: "123" },
    );
    return response;
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};

const sendImgQuery = async (img_query: string) => {
  try {
    const response = await baseRequest<BufferResponse | AuthType>(
      `${URI}/chat-img`,
      "POST",
      { "content-Type": "application/json" },
      { img_query },
    );
    console.log(response);

    return response;
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};

const sendImgMessage = async (img_buffer: Buffer<ArrayBufferLike>) => {
  try {
    const response = await baseRequest<ImagePdfEmbedResponse>(
      `${URI}/create-embed-img`,
      "POST",
      { "content-Type": "application/json" },
      {
        buffer: {
          data: Array.from(img_buffer),
        },
      },
    );
    return response;
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};

const sendPdfToDrive = async (
  pdfBuffer: Buffer<ArrayBufferLike>,
  pdf_file_name: string,
) => {
  try {
    const response = await baseRequest<ImagePdfEmbedResponse>(
      `${URI}/send-pdfbuffer`,
      "POST",
      { "content-Type": "application/json" },
      {
        buffer: {
          data: Array.from(pdfBuffer),
        },
        pdf_name: pdf_file_name,
      },
    );
    return response;
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};

const search_pdf = async (Pdf_query: string) => {
  try {
    const response = await baseRequest<{
      reply:
        | [
            {
              File_Name: string;
              date: string;
              total_pages: number;
              cover_buffer: string;
            },
          ]
        | {
            reply: string;
            pdf_name: string;
          };
    }>(
      `${URI}/search_pdf_query`,
      "POST",
      { "content-Type": "application/json" },
      {
        Pdf_query: Pdf_query,
      },
    );

    return response;
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};

export {
  sendTextMessage,
  sendImgMessage,
  sendImgQuery,
  sendPdfToDrive,
  search_pdf,
};
