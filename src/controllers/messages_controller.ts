const URI = "http://127.0.0.1:8000";
type BackendResponse = {
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
    const response = await baseRequest<BackendResponse>(
      `${URI}/chat`,
      "POST",
      { "content-Type": "application/json" },
      { message, thread_id: "123" },
    );

    if (response) {
      const data = response["reply"];
      return data;
    }
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};
const sendImgMessage = async (message: string) => {
  try {
    const response = await baseRequest<BackendResponse>(
      `${URI}/img`,
      "POST",
      { "content-Type": "application/json" },
      { message, thread_id: "123" },
    );

    if (response) {
      const data = response["reply"];
      return data;
    }
  } catch (error) {
    console.log("Error has been occured ", error);
  }
};
export { sendTextMessage };
