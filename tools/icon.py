import sys, os
from PIL import Image, ImageDraw
res = sys.argv[1]; www = sys.argv[2]
NAVY=(10,26,48,255); GOLD=(245,197,24,255); RED=(214,59,43,255)
def art(size, bg):
    S=size*4; im=Image.new('RGBA',(S,S),NAVY if bg else (0,0,0,0)); d=ImageDraw.Draw(im)
    if bg: d.ellipse([S*.08,S*.08,S*.92,S*.92],fill=(31,95,191,255))
    k = 1 if bg else 0.62   # foreground must sit in the adaptive-icon safe zone
    c=S/2; u=lambda v: c+(v-.5)*S*k
    # bat (rotated rectangle)
    import math
    a=math.radians(-40)
    def rot(x,y): return (u(.5)+(x*math.cos(a)-y*math.sin(a))*S*k, u(.5)+(x*math.sin(a)+y*math.cos(a))*S*k)
    blade=[rot(-.09,-.05),rot(.09,-.05),rot(.09,.36),rot(-.09,.36)]
    handle=[rot(-.035,-.36),rot(.035,-.36),rot(.035,-.05),rot(-.035,-.05)]
    d.polygon(handle,fill=(122,90,46,255)); d.polygon(blade,fill=GOLD)
    # ball
    r=.12*S*k; bx,by=u(.66),u(.33)
    d.ellipse([bx-r,by-r,bx+r,by+r],fill=RED)
    d.arc([bx-r*.75,by-r*1.2,bx+r*.75,by+r*1.2],250,290,fill=(255,255,255,255),width=int(S*.008)+1)
    d.arc([bx-r*.75,by-r*1.2,bx+r*.75,by+r*1.2],70,110,fill=(255,255,255,255),width=int(S*.008)+1)
    return im.resize((size,size),Image.LANCZOS)
sizes={'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}
for dn,s in sizes.items():
    p=f'{res}/mipmap-{dn}'
    full=art(s,True); full.save(f'{p}/ic_launcher.png')
    m=Image.new('L',(s,s),0); ImageDraw.Draw(m).ellipse([0,0,s-1,s-1],fill=255)
    rnd=Image.new('RGBA',(s,s),(0,0,0,0)); rnd.paste(full,(0,0),m); rnd.save(f'{p}/ic_launcher_round.png')
    art(int(s*108/48),False).save(f'{p}/ic_launcher_foreground.png')
art(512,True).save(f'{www}/icon-512.png'); art(192,True).save(f'{www}/icon-192.png')
print('icons ok')
