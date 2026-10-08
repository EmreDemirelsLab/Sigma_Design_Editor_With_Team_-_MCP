#!/usr/bin/env python3
import argparse,json,pathlib,re,secrets,os
p=argparse.ArgumentParser();p.add_argument('user');p.add_argument('--revoke',action='store_true');a=p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',a.user):raise SystemExit('Use a simple user identifier')
f=pathlib.Path(__file__).resolve().parents[1]/'.env';text=f.read_text()
match=re.search(r"^SIGMA_AI_USERS='(.*)'$",text,re.M)
if not match:raise SystemExit('SIGMA_AI_USERS must be a single-quoted JSON object in .env')
users=json.loads(match[1]);token=secrets.token_urlsafe(32)
if a.revoke:users.pop(a.user,None)
else:users[a.user]=token
text=text[:match.start()]+"SIGMA_AI_USERS='"+json.dumps(users,separators=(',',':'))+"'"+text[match.end():]
# Private atomic replacement; never write tokens into repository files.
tmp=f.with_name('.env.tmp');fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as h:h.write(text)
os.replace(tmp,f)
print('Revoked' if a.revoke else 'Personal AI token (shown here once): '+token)
print('Apply with: docker compose up -d --force-recreate sigma-assistant')
