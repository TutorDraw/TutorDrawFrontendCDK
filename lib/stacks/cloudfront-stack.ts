import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as certificatemanager from "aws-cdk-lib/aws-certificatemanager";
import { APPLICATION_NAME, AWS_ACCOUNT, DOMAIN_NAME } from "../configuration";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { Region } from "../constants";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Effect } from "aws-cdk-lib/aws-iam";

interface CloudFrontStackProps extends cdk.StackProps {
    stageName: string;
    domain: string;
    apiDomain: string;
    apiOriginRegion: string;
    staticAssetsBucketName: string;
    isProd: boolean;
}

export class CloudFrontStack extends cdk.Stack {
    public readonly distribution: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
        super(scope, id, props);

        // Ensure props is defined and destructure safely
        const stageName = props.stageName;
        if (props.env?.region !== Region.US_EAST_1) {
            throw new Error(
                "The stack contains Lambda@Edge functions and must be deployed in 'us-east-1'"
            );
        }

        // S3 Bucket for static website hosting
        const websiteBucket = new s3.Bucket(this, `${APPLICATION_NAME}-Bucket-${stageName}`, {
            bucketName: props.staticAssetsBucketName,
            enforceSSL: true,
            publicReadAccess: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Automatically delete bucket during stack teardown (optional)
            autoDeleteObjects: true
        });

        const edgeRequestFunctionRole = new cdk.aws_iam.Role(
            this,
            "SecureOriginInterceptorEdgeLambdaRole",
            {
                assumedBy: new cdk.aws_iam.CompositePrincipal(
                    new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
                    new cdk.aws_iam.ServicePrincipal("edgelambda.amazonaws.com")
                ),
                managedPolicies: [
                    cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
                        "service-role/AWSLambdaBasicExecutionRole"
                    )
                ],
                //this role in case no value is provided
                roleName: `${APPLICATION_NAME}-OriginRequest-${props.stageName}-Role`
            }
        );

        const invokeApiPolicy = new PolicyStatement({
            sid: "AllowInvokeApiGateway",
            effect: Effect.ALLOW,
            actions: ["execute-api:Invoke"],
            resources: [`arn:aws:execute-api:${props.apiOriginRegion}:${AWS_ACCOUNT}:*/*/*/*`]
        });

        edgeRequestFunctionRole.addToPolicy(invokeApiPolicy);

        const oac = new cloudfront.S3OriginAccessControl(this, `OAC-${stageName}`, {
            signing: cloudfront.Signing.SIGV4_NO_OVERRIDE
        });

        const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(websiteBucket, {
            originAccessControl: oac
        });

        // Look up the existing hosted zone for your domain
        const hostedZone = route53.HostedZone.fromLookup(
            this,
            `${APPLICATION_NAME}HostedZone-${stageName}`,
            {
                domainName: DOMAIN_NAME // Your domain name
            }
        );

        const certificate = certificatemanager.Certificate.fromCertificateArn(
            this,
            `${APPLICATION_NAME}-certificate`,
            cdk.Fn.importValue(`${APPLICATION_NAME}-certificate`)
        );

        // Construct the full URL for the API Gateway (use the appropriate URL format)

        const apiGatewayOrigin = new origins.HttpOrigin(props.apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY
        });

        const originRequestPolicy = new cloudfront.OriginRequestPolicy(
            this,
            "TutorDrawOriginRequestPolicy",
            {
                originRequestPolicyName: `tutordraw-origin-request-policy-${props.stageName}`,
                headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
                    "Accept",
                    "x-forwarded-user",
                    "x-forwarded-payload",
                    "x-client-verify",
                    "X-auth"
                ),
                queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(), // Forward all query strings
                cookieBehavior: cloudfront.OriginRequestCookieBehavior.all() // Forward all cookies
            }
        );

        const apiResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
            this,
            "TutorDrawApiResponseHeadersPolicy",
            {
                responseHeadersPolicyName: `tutordraw-api-response-headers-${props.stageName}`,
                corsBehavior: {
                    accessControlAllowCredentials: true,
                    accessControlAllowOrigins: ["http://localhost:5173"], // ✅ Explicitly allow frontend
                    accessControlAllowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                    accessControlAllowHeaders: ["Authorization", "Content-Type", "X-auth"],
                    accessControlExposeHeaders: ["Authorization"], // If API returns auth headers
                    originOverride: true // Ensures this header is always set
                }
            }
        );

        // Create the CloudFront distribution
        this.distribution = new cloudfront.Distribution(
            this,
            `${APPLICATION_NAME}StaticWebsiteDistribution-${stageName}`,
            {
                comment: `TutorDraw in ${stageName}`,
                defaultBehavior: {
                    origin: s3Origin,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    compress: true
                },
                additionalBehaviors: {
                    "/api/*": {
                        origin: apiGatewayOrigin,
                        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                        originRequestPolicy,
                        ...(!props.isProd && {
                            responseHeadersPolicy: apiResponseHeadersPolicy
                        }),
                        compress: true
                    }
                },
                domainNames: [props.domain],
                certificate: certificate,
                priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL
            }
        );

        // Create a CNAME record for the subdomain
        if (props.domain === DOMAIN_NAME) {
            // Use Alias Record for root domain
            new route53.ARecord(this, `${APPLICATION_NAME}StaticWebsiteAliasRecord-${stageName}`, {
                zone: hostedZone,
                recordName: props.domain, // Root domain (e.g., tutordraw.io)
                target: route53.RecordTarget.fromAlias(new CloudFrontTarget(this.distribution))
            });
        } else {
            // subdomain uses CNAME
            new route53.CnameRecord(
                this,
                `${APPLICATION_NAME}StaticWebsiteCnameRecord-${stageName}`,
                {
                    zone: hostedZone,
                    recordName: props.domain, // Your subdomain
                    domainName: this.distribution.distributionDomainName
                }
            );
        }

        // Output the CloudFront distribution ID
        new cdk.CfnOutput(this, "CloudFrontDistributionId", {
            value: this.distribution.distributionId,
            exportName: `CloudFrontDistributionId-${props.stageName}`
        });
    }
}
