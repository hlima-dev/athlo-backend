import { z } from 'zod'

// Campo de e-mail opcional que tolera string vazia ("") vindo de formulários
// do frontend — sem isso, z.string().email().optional() rejeita "" porque
// .optional() só aceita ausência/undefined, não string vazia.
export const optionalEmail = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().email().optional(),
)

// Mesma lógica para campos de URL opcionais (ex: logoUrl).
export const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
)
