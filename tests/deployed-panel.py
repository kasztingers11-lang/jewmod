import json
import http.cookiejar
import urllib.request
import urllib.error
from urllib.parse import urlsplit, parse_qs, urlencode

origin='https://www.fosternya.xyz'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):return None
jar=http.cookiejar.CookieJar()
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),NoRedirect())
def call(path,method='GET',body=None):
    headers={'Cache-Control':'no-cache'}
    if method!='GET':headers.update({'Origin':origin,'Content-Type':'application/json'})
    req=urllib.request.Request(origin+path,headers=headers,method=method,data=json.dumps(body).encode() if body is not None else None)
    try:r=client.open(req,timeout=25)
    except urllib.error.HTTPError as error:r=error
    return r.status,r.read(),r.headers

for action in ['session','profile','pair','license-reveal','license-reset']:
    status,_,_=call('/api/panel?action='+action,'POST',{})
    assert status==401,(action,status)
status,body,_=call('/api/panel?action=auth')
assert status==200 and json.loads(body)=={'provider':'discord','configured':True,'preview':False}
status,_,headers=call('/api/auth/login')
assert status==303,('login',status)
url=urlsplit(headers['Location']);query=parse_qs(url.query)
assert url.scheme=='https' and url.netloc=='discord.com'
assert query['client_id']==['1565654517804957776']
assert query['scope']==['identify'] and query['code_challenge_method']==['S256']
assert query['redirect_uri']==[origin+'/api/auth/callback']
assert query.get('state') and query.get('code_challenge')
cookie=headers.get('Set-Cookie','')
assert all(part in cookie for part in ['__Host-neoperro_oauth=','Secure','HttpOnly','SameSite=Lax','Max-Age=600'])
status,_,headers=call('/api/auth/callback?'+urlencode({'state':query['state'][0],'error':'access_denied','iss':'https://discord.com'}))
assert status==303 and headers.get('Location')=='/dashboard?auth=failed'
assert 'Max-Age=0' in headers.get('Set-Cookie','')
assert call('/api/panel?action=session')[0]==401
print('PASS: production rejects anonymous private actions; Discord identify-only authorization, PKCE, state cookie and denied-callback cleanup verified.')
print('No real Discord consent, customer license claim, key reveal or HWID reset was performed; those still require the owner/user test.')
