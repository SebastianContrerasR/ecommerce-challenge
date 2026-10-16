import { Type } from "@sinclair/typebox";

export const ErrorDetailSchema = Type.Record(Type.String(), Type.Unknown());

export const ErrorEnvelopeSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    details: Type.Optional(ErrorDetailSchema),
  }),
});
