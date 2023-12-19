#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { FTPServerStack } from "../lib/ftp-server-stack";

const app = new cdk.App();
new FTPServerStack(app, "FTPServerStack", {});
