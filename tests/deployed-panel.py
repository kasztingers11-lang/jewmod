import http.cookiejar
import json
import urllib.request
import urllib.error
from pathlib import Path

origin='https://www.fosternya.xyz'
jar=http.cookiejar.CookieJar()
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf=None
def call(action,method='GET',data=None,bearer=None):
    headers={'Cache-Control':'no-cache'}
    if method!='GET':
        headers['Origin']=origin
        headers['Content-Type']='application/json'
        if csrf:headers['X-Neoperro-CSRF']=csrf
    if bearer:headers['Authorization']='Bearer '+bearer
    req=urllib.request.Request(origin+'/api/panel?action='+action,headers=headers,method=method,data=json.dumps(data).encode() if data is not None else None)
    try:r=client.open(req,timeout=25)
    except urllib.error.HTTPError as e:r=e
    body=r.read()
    return r.status,json.loads(body),r.headers

status,session,headers=call('session','POST',{})
assert status==201,('session',status,session.get('error'))
cookie=headers.get('Set-Cookie','')
assert all(x in cookie for x in ['__Host-neoperro=','HttpOnly','Secure','SameSite=Strict','Max-Age=43200'])
csrf=session['csrf']
try:
    defaults=json.loads((Path(__file__).resolve().parents[1]/'public/config-schema.json').read_text(encoding='utf-8'))['defaults']
    status,saved,_=call('profile','POST',{'name':'Disposable integration test','config':defaults,'revision':0})
    assert status==200 and saved['revision']==1,('save',status,saved.get('error'))
    status,pair,_=call('pair','POST',{})
    assert status==200,('pair',status)
    token=pair['token']
    payload={'version':'1.3.38','game':'Other','appliedRevision':0,'rejectedRevision':0,'errorCode':None}
    status,delivery,_=call('runtime','POST',payload,token)
    assert status==200 and delivery['config']==defaults,('delivery',status,delivery.get('error'))
    payload['appliedRevision']=1
    status,ack,_=call('runtime','POST',payload,token)
    assert status==200 and ack['config'] is None,('ack',status,ack.get('error'))
    status,view,_=call('session')
    assert status==200 and view['runtime']['appliedRevision']==1 and view['runtime']['deliveredRevision']==1
    assert view['stats']['executions']==1 and 'tokenHash' not in json.dumps(view)
    status,_,_=call('pair','DELETE')
    assert status==200
    status,_,_=call('runtime','POST',payload,token)
    assert status==401
    print('PASS: production private Blob save, delivery, revision acknowledgment, workspace view and revocation. Simulated client, not a Roblox shot or compatibility test.')
finally:
    status,_,headers=call('session','DELETE')
    assert status==200 and 'Max-Age=0' in headers.get('Set-Cookie','')
    csrf=None
    print('PASS: disposable production workspace removed and session cookie cleared; no credentials printed or saved.')
