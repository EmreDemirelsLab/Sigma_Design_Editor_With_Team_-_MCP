#!/usr/bin/env python3
import pathlib,re,sys
from urllib.parse import urlparse
root=pathlib.Path(__file__).resolve().parents[1];f=root/'.env'
if not f.exists():raise SystemExit('Run python3 scripts/setup.py first.')
values={}
for line in f.read_text().splitlines():
    if line.strip() and not line.startswith('#') and '=' in line:
        k,v=line.split('=',1);values[k]=v.strip().strip("'").strip('"')
errors=[];uri=urlparse(values.get('PENPOT_PUBLIC_URI',''));flags=values.get('PENPOT_FLAGS','').split()
for key in ['PENPOT_SECRET_KEY','POSTGRES_PASSWORD']:
    if len(values.get(key,''))<32:errors.append(key+' is missing or too short')
if uri.scheme not in ['http','https'] or not uri.hostname:errors.append('Invalid PENPOT_PUBLIC_URI')
if uri.hostname not in ['localhost','127.0.0.1']:
    if uri.scheme!='https':errors.append('Production must use HTTPS')
    if 'disable-secure-session-cookies' in flags or 'disable-email-verification' in flags:errors.append('Unsafe production flags')
    if values.get('SMTP_HOST','') in ['','penpot-mailcatch']:errors.append('Real SMTP_HOST required')
    if 'local' in values.get('COMPOSE_PROFILES','').split(','):errors.append('Remove local profile for production')
if values.get('AI_MODEL') and not values.get('AI_API_KEY') and values.get('AI_ALLOW_HTTP')!='true':errors.append('AI_API_KEY required for cloud AI')
if errors:raise SystemExit('\n'.join(errors))
print('Preflight passed; no secrets printed.')
