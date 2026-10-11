import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const level = searchParams.get("level") ?? undefined;
  const districtCode = searchParams.get("districtCode") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const organizations = await prisma.organization.findMany({
    where: {
      level: level ? (level as never) : undefined,
      districtCode: districtCode ?? undefined,
      isActive: true,
      name: q ? { contains: q } : undefined,
    },
    select: { id: true, level: true, code: true, name: true, districtCode: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  return NextResponse.json({ organizations });
}
