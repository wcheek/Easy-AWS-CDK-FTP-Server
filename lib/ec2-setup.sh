#!/bin/sh
yum update
# "yum upgrade -y"

# Use mount-s3 to mount a directory with the bucket
wget https://s3.amazonaws.com/mountpoint-s3-release/latest/x86_64/mount-s3.rpm
yum install -y ./mount-s3.rpm
mkdir /etc/ftp
mount-s3 ${bucketName} /etc/ftp --allow-other --allow-delete --dir-mode 777

# VSFTPD
yum install -y vsftpd
sudo systemctl enable vsftpd

# Passive mode - pass the correct public IP to client
local_address=$(TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600") && curl -H "X-aws-ec2-metadata-token: $TOKEN" -v http://169.254.169.254/latest/meta-data/public-ipv4)
echo "pasv_address=$local_address" >>/etc/vsftpd/vsftpd.conf

# Make SSL key to enable FTPS
openssl req -x509 -nodes -days 1825 -newkey rsa:2048 -keyout /etc/vsftpd/vsftpd.key -out /etc/vsftpd/vsftpd.pem -subj "/C=JP/ST=Hiroshima/L=Saijo/CN=SATAKE_TLS"

## User configuration.
# Setup virtual user
groupadd nogroup
useradd --home-dir /etc/ftp --gid nogroup -m --shell /bin/false ftpUser

# Get user pass from secrets manager
password=$(aws secretsmanager get-secret-value --secret-id=${secretID} --region=${region} --query SecretString --output text | cut -d: -f2 | tr -d \"})
# Set up the virtual user
echo "ftpUser" >>/etc/vsftpd/vusers.txt
echo "$password" >>/etc/vsftpd/vusers.txt
db_load -T -t hash -f /etc/vsftpd/vusers.txt /etc/vsftpd/vsftpd-virtual-user.db
chmod 600 /etc/vsftpd/vsftpd-virtual-user.db
mv /etc/pam.d/vsftpd ./vsftpd.backup
echo "#%PAM-1.0" >/etc/pam.d/vsftpd
echo ""
echo "auth       required     pam_userdb.so db=/etc/vsftpd/vsftpd-virtual-user" >>/etc/pam.d/vsftpd
echo "account    required     pam_userdb.so db=/etc/vsftpd/vsftpd-virtual-user" >>/etc/pam.d/vsftpd
echo "session    required     pam_loginuid.so" >>/etc/pam.d/vsftpd
chown ftpUser.nogroup /etc/ftp
mkdir /etc/vsftpd/ftpUser_user_conf
echo "local_root=/etc/ftp" >/etc/vsftpd/ftpUser_user_conf/username
sudo systemctl restart vsftpd

# Ensure vsftpd restarts
chkconfig --level 345 vsftpd on
