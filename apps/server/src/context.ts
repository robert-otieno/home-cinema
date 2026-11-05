import { openDatabase } from "@cinema/database";
export type Database = Awaited<ReturnType<typeof openDatabase>>["db"];
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const now = () => Date.now();
