import { NextRequest } from "next/server";
import { serviceHttp } from "@/lib/service-http";
export const dynamic = "force-dynamic";
export const GET = (request: NextRequest) => serviceHttp(request, false);
export const POST = (request: NextRequest) => serviceHttp(request, false);
