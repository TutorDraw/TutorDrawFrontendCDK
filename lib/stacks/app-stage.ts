import { Construct } from "constructs";
import { Stage, StageProps } from "aws-cdk-lib";
import { CloudFrontStack } from "./cloudfront-stack";
import { APPLICATION_NAME } from "../configuration";

interface DeploymentkProps extends StageProps {
    stageName: string;
    domain: string;
    apiDomain: string;
    apiOriginRegion: string;
    staticAssetsBucketName: string;
    isProd: boolean;
}

export class PipelineAppStage extends Stage {
    constructor(scope: Construct, id: string, props: DeploymentkProps) {
        super(scope, id, props);

        new CloudFrontStack(this, `${APPLICATION_NAME}CloudFrontStack-${props.stageName}`, {
            stageName: props.stageName,
            staticAssetsBucketName: props.staticAssetsBucketName,
            apiDomain: props.apiDomain,
            domain: props.domain,
            apiOriginRegion: props.apiOriginRegion,
            isProd: props?.isProd,
            env: props.env,
            description: `Create ${APPLICATION_NAME} S3, Cloudfront`
        });
    }
}
