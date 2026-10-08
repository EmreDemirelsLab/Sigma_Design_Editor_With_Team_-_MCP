#!/usr/bin/env python3
"""Create configuration without overwriting existing secrets."""
import argparse,pathlib,secrets,re,os
from urllib.parse import urlparse
root=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--domain');p.add_argument('--email');a=p.parse_args()
target=root/'.env'
if target.exists():raise SystemExit('.env already exists; edit it instead of rotating database credentials.')
text=(root/'.env.example').read_text()
def set_value(key,value):
    global text
    text=re.sub(r'^'+re.escape(key)+r'=.*$',key+'='+value,text,flags=re.M)
set_value('PENPOT_SECRET_KEY',secrets.token_urlsafe(64));set_value('POSTGRES_PASSWORD',secrets.token_hex(32))
if a.domain:
    if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?',a.domain) or '.' not in a.domain:raise SystemExit('Use a domain only, e.g. design.example.com')
    if not a.email or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',a.email):raise SystemExit('--email required with --domain')
    set_value('PENPOT_PUBLIC_URI','https://'+a.domain);set_value('SIGMA_SITE_ADDRESS',a.domain)
    set_value('SIGMA_HTTP_PORT','80');set_value('SIGMA_HTTPS_PORT','443');set_value('ACME_EMAIL',a.email)
    set_value('COMPOSE_PROFILES','');set_value('SMTP_HOST','');set_value('SMTP_PORT','587');set_value('SMTP_TLS','true')
    set_value('PENPOT_FLAGS','enable-email-verification enable-smtp enable-secure-session-cookies enable-mcp enable-login-with-password enable-registration disable-telemetry')
fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write(text)
print('Configuration created. Fill SMTP and optional AI settings before starting production.')
