import { Type } from "@sinclair/typebox";

export const LiveResponseSchema = Type.Object({
  status: Type.Literal("ok"),
  service: Type.Literal("api"),
});

export const ReadyResponseSchema = Type.Object({
  status: Type.Literal("ok"),
  database: Type.Literal("connected"),
});

export const NotReadyResponseSchema = Type.Object({
  status: Type.Literal("error"),
  database: Type.Literal("disconnected"),
});
