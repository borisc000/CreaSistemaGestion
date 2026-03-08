import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      const requestId = randomUUID();
      console.error(`[request:${requestId}]`, error);
      return NextResponse.json({ error: "Unexpected server error.", requestId }, { status: error.status });
    }
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const requestId = randomUUID();
  console.error(`[request:${requestId}]`, error);
  return NextResponse.json({ error: "Unexpected server error.", requestId }, { status: 500 });
}
