export function getMediaStorage(environment = process.env) {
  const region = environment.AWS_REGION || environment.AWS_DEFAULT_REGION || "ap-northeast-1";
  if (environment.ISOLATED_APP_REVIEW_ENABLED === "true") {
    return { region, bucket: undefined, publicBaseUrl: undefined };
  }

  return {
    region,
    bucket: environment.AVATAR_BUCKET_NAME,
    publicBaseUrl: environment.AVATAR_PUBLIC_BASE_URL?.replace(/\/$/, ""),
  };
}
