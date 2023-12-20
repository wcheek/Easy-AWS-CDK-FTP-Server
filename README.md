# Cheap & Easy AWS FTP Server with EC2 and S3

## Introduction

Using `AWS CDK` we can quickly deploy a small `EC2 Instance` to act as an
FTP Server with an unlimited S3 storage backend.

With an hourly rate of only `$0.0058` (us-east-1), `t2-nano` is sufficient for
running a small FTP server with the S3 integration!

The server is configured on deploy using [EC2 UserData](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html).
[`mount-s3`](https://aws.amazon.com/s3/features/mountpoint/)
is used for mounting an S3 bucket to your instance. We start up [`VSFTPD`](https://help.ubuntu.com/community/vsftpd),
[set up a virtual user](https://docs.rockylinux.org/guides/file_sharing/secure_ftp_server_vsftpd/)
in the same directory as our mounted S3 bucket,
and we have our end-to-end FTP solution!

## Architecture

![architecture](Documentation/architecture.png)

1. A user connects to the instance with the instance's Public IP or DNS.
2. The user agrees to use the server's TLS certificate.
3. A secure FTPS connection is made and the user can freely work with the
   files on the S3 bucket.

### CDK Structure

You'll find the code for the stack in `lib/ftp-server-stack.ts`. It uses four
custom `Constructs`:

1. `VPCStuff` creates a simple `VPC` with no `NAT Gateways` since they aren't
   necessary and we want to save on cost (`NAT Gateways` are expensive!)
2. `StorageStuff` creates a bucket to persist data from the FTP server.
   It's set to automatically delete data and remove itself on `cdk destroy`.
3. `SecurityStuff` creates an `IAM Role` with permissions to read and write
   to the FTP bucket and access the `Secret` that stores the password
   for the `ftpUser` account we will create on the EC2 instance. `SecurityStuff`
   also creates an `EC2 Security Group` inside our `VPC` which allows
   `SSH` and `FTP` access into the EC2 instance. Additionally, we open
   ports which will be used for the data connection with `VSFTPD`
4. Finally, `ec2InstanceStuff` creates and configures the EC2 instance.
   The instance is based on [`Amazon Linux 2`](https://aws.amazon.com/amazon-linux-2/faqs/)

The EC2 instance Public IP and the FTP Bucket name gets output upon
successful deploy.

## Method

[`AWS CDK`](https://aws.amazon.com/cdk/) is used to synthesize the
`CloudFormation` template that will deploy our architecture and
also configure the server.
We configure the EC2 instance using [EC2 UserData](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html)
stored as a bash script in `lib/ec2-setup.sh`. We also use [`CloudFormationInit`](https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_ec2/CloudFormationInit.html)
to store a slightly customized `vsftpd.conf` file.

## Things you need to do yourself

1. Make a secret on [`AWS Secrets Manager`](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
   for your ftp user password. You'll use this when connecting to the server.
2. Fix references to your secret. I named by secret "ftpUser_Password".
   You'll find references to this in the `ec2InstanceStuff` and `securityStuff`
   constructs in `lib/ftp-server-stack.ts`
3. Create a `Key Pair` using the `AWS EC2 Console`. You'll need this to
   access the instance by SSH.
4. Fix references to the `Key Pair`. I've named mine `"RiceCooker_FTP_Server"` -
   this needs to match the `Key Pair` that you just made.
5. Copy the repo and `cdk deploy`!
