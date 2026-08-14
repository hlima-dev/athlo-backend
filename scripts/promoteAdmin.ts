// Promove um usuário existente a administrador da plataforma ATHLO.
// Uso: npm run admin:promote -- usuario@empresa.com
import { prisma } from '../src/config/prisma'

async function main() {
  const email = process.argv[2]

  if (!email) {
    console.error('Uso: npm run admin:promote -- <email>')
    process.exit(1)
  }

  const user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    console.error(`Usuário com e-mail "${email}" não encontrado.`)
    process.exit(1)
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { isPlatformAdmin: true },
  })

  console.log(`✔ ${email} agora é administrador da plataforma ATHLO.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
