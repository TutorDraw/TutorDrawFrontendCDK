import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as route53 from "aws-cdk-lib/aws-route53";
import { APPLICATION_NAME, DOMAIN_NAME } from "../configuration";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";

export interface StaticAssetsStackProps extends cdk.StackProps {
    stageName: string;
    isProd: boolean;
}

export class StaticAssetsStack extends cdk.Stack {
    public readonly bucket: s3.Bucket;
    public readonly distribution: cloudfront.Distribution;
    public readonly originAccessControl: cloudfront.S3OriginAccessControl;

    constructor(scope: Construct, id: string, props: StaticAssetsStackProps) {
        super(scope, id, props);

        // Create the static assets bucket
        this.bucket = new s3.Bucket(this, "StaticAssetsBucket", {
            bucketName: `tutordraw-website-${props.stageName}`,
            enforceSSL: true,
            publicReadAccess: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            cors: [
                {
                    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
                    allowedOrigins: ["*"],
                    allowedHeaders: ["*"],
                    exposedHeaders: ["ETag"]
                }
            ]
        });

        // Create OAC for the static assets bucket
        this.originAccessControl = new cloudfront.S3OriginAccessControl(
            this,
            `StaticAssetsOAC-${props.stageName}`,
            {
                signing: cloudfront.Signing.SIGV4_NO_OVERRIDE
            }
        );

        const staticAssetsOrigin = origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
            originAccessControl: this.originAccessControl
        });

        // Create response headers policy for static assets
        const assetsResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
            this,
            "StaticAssetsResponseHeadersPolicy",
            {
                responseHeadersPolicyName: `static-assets-response-headers-${props.stageName}`,
                corsBehavior: {
                    accessControlAllowCredentials: false,
                    accessControlAllowOrigins: ["*"],
                    accessControlAllowMethods: ["GET", "HEAD", "OPTIONS"],
                    accessControlAllowHeaders: ["*"],
                    accessControlExposeHeaders: ["ETag"],
                    originOverride: true
                }
            }
        );

        // Look up the existing hosted zone
        const hostedZone = route53.HostedZone.fromLookup(
            this,
            `${APPLICATION_NAME}HostedZone-${props.stageName}`,
            {
                domainName: DOMAIN_NAME
            }
        );

        const certificate = certificatemanager.Certificate.fromCertificateArn(
            this,
            `${APPLICATION_NAME}-certificate`,
            cdk.Fn.importValue(`${APPLICATION_NAME}-certificate`)
        );
        // Create CloudFront distribution for static assets
        this.distribution = new cloudfront.Distribution(
            this,
            `${APPLICATION_NAME}StaticAssetsDistribution-${props.stageName}`,
            {
                comment: `TutorDraw Static Assets in ${props.stageName}`,
                defaultBehavior: {
                    origin: staticAssetsOrigin,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    responseHeadersPolicy: assetsResponseHeadersPolicy,
                    compress: true
                },
                domainNames: [props.isProd ? `assets.${DOMAIN_NAME}` : `assets-dev.${DOMAIN_NAME}`],
                certificate: certificate,
                priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL
            }
        );

        // Create DNS record for static assets subdomain
        new route53.CnameRecord(
            this,
            `${APPLICATION_NAME}StaticAssetsCnameRecord-${props.stageName}`,
            {
                zone: hostedZone,
                recordName: props.isProd ? `assets.${DOMAIN_NAME}` : `assets-dev.${DOMAIN_NAME}`,
                domainName: this.distribution.distributionDomainName
            }
        );

        // Export the bucket name
        new cdk.CfnOutput(this, "StaticAssetsBucketName", {
            value: this.bucket.bucketName,
            exportName: `StaticAssetsBucketName-${props.stageName}`
        });
    }
}
