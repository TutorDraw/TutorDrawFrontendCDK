import * as cdk from "aws-cdk-lib";
import {
    Effect,
    ManagedPolicy,
    PolicyStatement,
    Role,
    ServicePrincipal
} from "aws-cdk-lib/aws-iam";
import {
    CodeBuildStep,
    CodePipeline,
    CodePipelineSource,
    ManualApprovalStep,
    ShellStep
} from "aws-cdk-lib/pipelines";
import { Construct } from "constructs";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import * as codebuild from "aws-cdk-lib/aws-codebuild";

import {
    APPLICATION_NAME,
    GITHUB_OWNER,
    GITHUB_PACKAGE_BRANCH,
    GITHUB_REPO,
    GITHUB_CONNECTION_ARN,
    GITHUB_FRONTEND_REPO,
    DOMAIN_NAME,
    STATIC_ASSETS_BUCKET_DEV,
    STATIC_ASSETS_BUCKET_PROD
} from "../configuration/dependencies";
import { PipelineAppStage } from "./app-stage";
import { STAGES } from "../constants";

export class PipelineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Define the source for the pipeline
        const source = CodePipelineSource.connection(
            `${GITHUB_OWNER}/${GITHUB_REPO}`,
            GITHUB_PACKAGE_BRANCH,
            {
                connectionArn: GITHUB_CONNECTION_ARN,
                triggerOnPush: true // Enables automatic builds on push
            }
        );

        // Add source steps for both repositories
        const sourceStep = CodePipelineSource.connection(
            `${GITHUB_OWNER}/${GITHUB_FRONTEND_REPO}`,
            GITHUB_PACKAGE_BRANCH,
            {
                connectionArn: GITHUB_CONNECTION_ARN,
                triggerOnPush: true // Enables automatic builds on push
            }
        );

        // Create the IAM Role with Admin permissions
        const adminRole = new Role(this, `${APPLICATION_NAME}PipelineRole`, {
            assumedBy: new ServicePrincipal("codepipeline.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess")]
        });

        const s3AccessPolicy = new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
            resources: [
                `arn:aws:s3:::${STATIC_ASSETS_BUCKET_DEV}/*`,
                `arn:aws:s3:::${STATIC_ASSETS_BUCKET_DEV}`,
                `arn:aws:s3:::${STATIC_ASSETS_BUCKET_PROD}/*`,
                `arn:aws:s3:::${STATIC_ASSETS_BUCKET_PROD}`
            ]
        });

        adminRole.addToPolicy(s3AccessPolicy);

        // Create the high-level CodePipeline
        const pipeline = new CodePipeline(this, `${APPLICATION_NAME}Pipeline`, {
            pipelineName: `${APPLICATION_NAME}Pipeline`,
            synth: new ShellStep("Synth", {
                input: source,
                commands: ["npm ci", "npm run build", "npx cdk synth -c"]
            }),
            role: adminRole,
            codeBuildDefaults: {
                buildEnvironment: {
                    buildImage: codebuild.LinuxBuildImage.STANDARD_6_0
                },
                rolePolicy: [
                    new PolicyStatement({
                        actions: ["*"],
                        resources: ["*"]
                    })
                ]
            }
        });

        // Look up the existing hosted zone for your domain
        const hostedZone = HostedZone.fromLookup(this, `${APPLICATION_NAME}HostedZone`, {
            domainName: DOMAIN_NAME // Your domain name
        });

        // Create the ACM certificate
        const certificate = new cdk.aws_certificatemanager.Certificate(
            this,
            `${APPLICATION_NAME}Certificate`,
            {
                domainName: DOMAIN_NAME,
                subjectAlternativeNames: [`*.${DOMAIN_NAME}`], // Wildcard for all subdomains
                validation: cdk.aws_certificatemanager.CertificateValidation.fromDns(hostedZone)
            }
        );

        // Export repository URI as output
        new cdk.CfnOutput(this, `${APPLICATION_NAME}-certificate`, {
            value: certificate.certificateArn,
            exportName: `${APPLICATION_NAME}-certificate`
        });

        STAGES.forEach(
            ({ stageName, staticAssetsBucketName, isProd, env, buildCommand, apiOriginRegion }) => {
                const domain = isProd ? DOMAIN_NAME : `${stageName}.${DOMAIN_NAME}`;
                const apiDomain = isProd
                    ? `api.ecs.${DOMAIN_NAME}`
                    : `api.ecs.${stageName}.${DOMAIN_NAME}`;

                const buildStep = new CodeBuildStep(`Build-FrontEnd-${stageName}`, {
                    input: sourceStep,
                    installCommands: ["npm install"],
                    // TODO: add "npm run test" when frontend ready
                    commands: [buildCommand],
                    env: {
                        REACT_APP_STAGE: stageName,
                        CI: "true"
                    },
                    primaryOutputDirectory: "dist",
                    projectName: `BuildProject-${stageName}`
                });

                const deployStep = new ShellStep(`Deploy-FrontEnd-${stageName}`, {
                    input: buildStep,
                    commands: ["ls", `aws s3 sync . s3://${staticAssetsBucketName}`]
                });

                const invalidateCacheStep = new ShellStep(`InvalidateCache-${stageName}`, {
                    commands: [
                        // Fetch CloudFront Distribution ID using AWS CLI
                        `CLOUDFRONT_ID=$(aws cloudformation describe-stacks --stack-name ${stageName}-${APPLICATION_NAME}CloudFrontStack-${stageName} --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text)`,
                        // Use the fetched CloudFront ID to create invalidation
                        `aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"`
                    ]
                });

                const stage = new PipelineAppStage(this, `${stageName}-${APPLICATION_NAME}`, {
                    stageName,
                    apiDomain,
                    domain,
                    apiOriginRegion,
                    isProd,
                    env: { region: env.region, account: env.account },
                    staticAssetsBucketName
                });
                if (isProd) {
                    pipeline.addStage(stage, {
                        pre: [
                            new ManualApprovalStep("ApproveIfStable", {
                                comment:
                                    "Approve to continue production deployment. Make sure every changes are verified in dev."
                            }),
                            buildStep
                        ],
                        post: [deployStep, invalidateCacheStep]
                    });
                } else {
                    pipeline.addStage(stage, {
                        pre: [buildStep],
                        post: [deployStep, invalidateCacheStep]
                    });
                }
            }
        );
    }
}
