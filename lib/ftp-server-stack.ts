import { Stack, StackProps, RemovalPolicy, Duration } from "aws-cdk-lib";
import {
  aws_s3 as s3,
  aws_iam as iam,
  aws_ec2 as ec2,
  CfnOutput,
  aws_secretsmanager as secrets,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import { readFileSync } from "fs";

class VPCStuff extends Construct {
  public readonly VPC: ec2.Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.VPC = new ec2.Vpc(this, "ftpVPC", {
      natGateways: 0,
    });
  }
}

class StorageStuff extends Construct {
  public readonly ftpBucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.ftpBucket = new s3.Bucket(this, "FTPBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }
}

class SecurityStuff extends Construct {
  public readonly ec2Role: iam.Role;
  public readonly ec2SecurityGroup: ec2.SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    ftpBucket: s3.Bucket,
    VPC: ec2.Vpc,
  ) {
    super(scope, id);

    this.ec2Role = new iam.Role(this, "ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      maxSessionDuration: Duration.seconds(21600),
    });

    ftpBucket.grantReadWrite(this.ec2Role);

    this.ec2SecurityGroup = new ec2.SecurityGroup(this, "ec2SecurityGroup", {
      vpc: VPC,
      description: "Allow SSH and FTP access",
    });

    this.ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      new ec2.Port({
        stringRepresentation: "SSH",
        protocol: ec2.Protocol.TCP,
        fromPort: 22,
        toPort: 22,
      }),
      "Allow Incoming SSH",
    );
    this.ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      new ec2.Port({
        stringRepresentation: "FTP",
        protocol: ec2.Protocol.TCP,
        fromPort: 20,
        toPort: 21,
      }),
      "Allow incoming FTP",
    );
    this.ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      new ec2.Port({
        stringRepresentation: "FTP",
        protocol: ec2.Protocol.TCP,
        fromPort: 1024,
        toPort: 1048,
      }),
      "Allow incoming FTP for VSFTPD",
    );
    const passwordSecret = secrets.Secret.fromSecretNameV2(
      this,
      "FTPPassword",
      "ftpUser_Password",
    );
    passwordSecret.grantRead(this.ec2Role);
  }
}

class ec2InstanceStuff extends Construct {
  public readonly ec2Instance: ec2.Instance;
  constructor(
    scope: Construct,
    id: string,
    VPC: ec2.Vpc,
    ec2SecurityGroup: ec2.SecurityGroup,
    ec2Role: iam.Role,
    ftpBucket: s3.Bucket,
  ) {
    super(scope, id);

    this.ec2Instance = new ec2.Instance(this, "FTPServer", {
      instanceType: new ec2.InstanceType("t2.nano"),
      machineImage: ec2.MachineImage.latestAmazonLinux2({}),
      vpc: VPC,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
      requireImdsv2: true,
      keyName: "RiceCooker_FTP_Server",
      userDataCausesReplacement: true,
      init: ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          default: ["config"],
        },
        configs: {
          config: new ec2.InitConfig([
            ec2.InitFile.fromFileInline(
              "/etc/vsftpd/vsftpd.conf",
              "lib/vsftpd.conf",
            ),
          ]),
        },
      }),
    });

    const userDataText = readFileSync("lib/ec2-setup.sh", "utf8")
      .replace("${bucketName}", ftpBucket.bucketName)
      .replace("${region}", Stack.of(this).region)
      .replace("${secretID}", "ftpUser_Password");

    this.ec2Instance.addUserData(userDataText);
  }
}

export class FTPServerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    let { VPC } = new VPCStuff(this, "VPC");
    let { ftpBucket } = new StorageStuff(this, "Storage");
    let { ec2SecurityGroup, ec2Role } = new SecurityStuff(
      this,
      "Security",
      ftpBucket,
      VPC,
    );
    let { ec2Instance } = new ec2InstanceStuff(
      this,
      "Instance",
      VPC,
      ec2SecurityGroup,
      ec2Role,
      ftpBucket,
    );
    new CfnOutput(this, "ec2InstanceIP", {
      value: ec2Instance.instancePublicIp,
      description: "The Public IP of the FTP server.",
    });
    new CfnOutput(this, "FTPBucket", {
      value: ftpBucket.bucketName,
      description: "The name of the bucket connected to the FTP server.",
    });
  }
}
