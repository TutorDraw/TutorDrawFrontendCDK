#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { PipelineStack } from "../lib";
import { Region } from "../lib/constants";
import { APPLICATION_NAME, AWS_ACCOUNT } from "../lib/configuration";

const app = new cdk.App();
new PipelineStack(app, `${APPLICATION_NAME}PipelineStack`, {
    env: { region: Region.US_EAST_1, account: AWS_ACCOUNT }
});
