import { NextRequest } from "next/server";
import { nextPhaseHttp } from "@/lib/next-phase-http";
export const dynamic = "force-dynamic";
export const GET = (request: NextRequest) => nextPhaseHttp(request, true);
export const POST = (request: NextRequest) => nextPhaseHttp(request, true);
