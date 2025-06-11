# Welcome to your CDK TypeScript project

This is an Example project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Project structure

```
ExampleAWSCDK/
├── .husky/
│   ├── pre-commit    // build, testing, prettier before commit
├── bin/
│   ├── tutordrawcdk.ts
├── lib/
│   ├── configuration/
│   │   ├── dependencies.ts   // project specific config
│   ├── constants/
│   │   ├── index.ts
│   │   ├── regions.ts
│   │   ├── stages.ts     // here defining dev/prod variable
│   ├── constructs/
│   │   ├── <empty>       // several resources can be organized in a construct
│   ├── stacks/
│   │   ├── app-stage.ts  // stage deployment unit for each region
│   │   ├── index.ts
│   │   ├── lambda-stack.ts  // define lambda, api gateway resource
│   │   ├── pipeline-stack.ts // define codepipeline, stage
├── test/
│   ├── lambda-stackd.test.ts
├── cdk.out/  # Auto-generated CDK output
├── .gitignore
├── cdk.json
├── package.json
├── tsconfig.json
├── README.md
```

## Example Resources

- AWS CodePipeline
- Lambda: a hello world example
- API Gateway for Lambda
- Cloudwatch: this log stream is automatically created for Lambda

Besides, CodePipeline has 2 stages, `dev` and `prod` in `us-east-1` and `ap-northeast-1` respecitively.

The build and test are executed before deploying `dev`.

It is recommended to set up default region in `us-east-1` at your local machine and `CodePipeline` region.

See the example:

https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/ExamplePipeline/view?region=us-east-1

Testing in API Gateway:

https://us-east-1.console.aws.amazon.com/apigateway/main/apis?api=unselected&region=us-east-1

Log stream:

https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups

AWS CDK naming and concept:

**Stack**: An AWS CDK stack is the smallest single unit of deployment. Each stack will be transformed to a Cloudformation template.
https://docs.aws.amazon.com/cdk/v2/guide/stacks.html

**Construct**: A group of resources (Lambda + API Gateway etc.) as a unit for reusability. This is **NOT** a minimal deployment unit, but coding concept.
https://docs.aws.amazon.com/cdk/v2/guide/constructs.html

For more details, see AWS official docs:

https://docs.aws.amazon.com/cdk/v2/guide/home.html

For Developer CDK developer documentation (ex: Lambda creation, configuration)

https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda-readme.html

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `npx cdk deploy` deploy this stack to your default AWS account/region
-   - `npx cdk deploy <Pipeline_Stack_Name>` deploy the pipeline stack only as other stack deployment will be taken care by the pipeline
- `npx cdk diff` compare deployed stack with current state
- `npx cdk synth` emits the synthesized CloudFormation template

To make source your CDK working before push, run `npx cdk synth` to synth the Cloudformation locally to make sure resource synthesis rules built successfully.
