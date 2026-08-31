// Lista quem tem acesso de administrador da plataforma ATHLO.
// Uso: npm run admin:list
import { prisma } from '../src/config/prisma'

async function main() {
  const admins = await prisma.user.findMany({
    where: { isPlatformAdmin: true },
    select: { name: true, email: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })

  if (admins.length === 0) {
    console.log('Nenhum usuário com acesso de administrador da plataforma.')
    return
  }

  console.log(`${admins.length} administrador(es) da plataforma:\n`)
  for (const admin of admins) {
    console.log(`- ${admin.name} <${admin.email}> — desde ${admin.createdAt.toLocaleDateString('pt-BR')}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
