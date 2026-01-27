const URI = "http://127.0.0.1:8000";
import fs, { type WriteFileOptions } from "fs";

type BackendResponse = {
  reply: string;
};
type BufferResponse = {
  reply: string | ArrayBufferView<ArrayBufferLike>;
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
    const response = await baseRequest<BackendResponse>(
      `${URI}/chat`,
      "POST",
      { "content-Type": "application/json" },
      { message, thread_id: "123" },
    );
      console.log('sdfjiofsdiosdfo')

    if (response) {
      const data = response["reply"];

      return data;
    }
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};

const sendImgQuery = async (img_query: string) => {
  try {
    const response = await baseRequest<BufferResponse>(
      `${URI}/chat-img`,
      "POST",
      { "content-Type": "application/json" },
      { 'img_query':img_query, },
    );
    if (response) {
      
      const data = response["reply"];  


          
      return data;
    }
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};
const sendImgMessage = async (img_buffer: Buffer<ArrayBufferLike>) => {
  try {
    const response = await baseRequest<BackendResponse>(
      `${URI}/create-embed`,
      "POST",
      { "content-Type": "application/json" },
      { 'buffer':img_buffer, },
    );

    if (response) {
      const data = response["reply"];
        
      return data;
    }
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};
export { sendTextMessage ,sendImgMessage,sendImgQuery};
