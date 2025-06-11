import { CloudFrontRequestEvent } from "aws-lambda";

export const handler = async (event: CloudFrontRequestEvent) => {
    const request = event.Records[0].cf.request;
    const uri = request.uri;

    // If the URI doesn't contain a file extension, rewrite to /index.html
    if (!uri.match(/\/[^/]+\.[^/]+$/)) {
        request.uri = "/index.html";
    }

    return request;
};
