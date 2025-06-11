import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

export interface SsmParametersProps {
    parameterNames: { [key: string]: string }; // Key-Value map for parameters
}

export class SsmParameters extends Construct {
    public readonly values: { [key: string]: string };

    constructor(scope: Construct, id: string, props: SsmParametersProps) {
        super(scope, id);

        this.values = {};

        // Fetch each parameter and store in the values object
        for (const [key, parameterName] of Object.entries(props.parameterNames)) {
            const parameter = ssm.StringParameter.fromStringParameterAttributes(
                this,
                `Param-${key}`,
                {
                    parameterName
                }
            );

            this.values[key] = parameter.stringValue;
        }
    }
}
