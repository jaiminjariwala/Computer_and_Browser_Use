const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path')
app.whenReady().then(async () => {
 const win = new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}})
 try {
  await win.loadURL('data:text/html,<html></html>')
  const sources=['atlas.png','blue-ball.png'].map(name=>'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'../build/app-icons',name)).toString('base64'))
  const groups=await win.webContents.executeJavaScript(`(async()=>{
   const groups=[];
   for(const [index,src] of ${JSON.stringify(sources)}.entries()) {
    const img=new Image();img.src=src;await img.decode();
    const source=document.createElement('canvas');source.width=source.height=512;
    const s=source.getContext('2d');
    if(index===0)s.drawImage(img,img.width/3,0,img.width/3,img.height,0,0,512,512);else s.drawImage(img,0,0,512,512);
    const pixels=s.getImageData(0,0,512,512).data;let l=512,t=512,r=0,b=0;
    for(let y=0;y<512;y++)for(let x=0;x<512;x++)if(pixels[(y*512+x)*4+3]>128){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),frames=[];
    const scale=120/Math.max(r-l,b-t),w=(r-l)*scale,h=(b-t)*scale;
    for(let i=0;i<48;i++){ctx.clearRect(0,0,128,128);ctx.save();ctx.translate(64,64);ctx.rotate(i*Math.PI*2/48);ctx.drawImage(source,l,t,r-l,b-t,-w/2,-h/2,w,h);ctx.restore();frames.push(c.toDataURL().split(',')[1])}
    groups.push(frames);
   }return groups;
  })()`)
  for(const [index,name] of ['beach-ball','blue-ball'].entries()) {
   const folder=path.join(__dirname,'../build/dock-icons',name);fs.mkdirSync(folder,{recursive:true});
   groups[index].forEach((data,i)=>fs.writeFileSync(path.join(folder,String(i).padStart(2,'0')+'.png'),Buffer.from(data,'base64')))
  }
  console.log('Generated 96 larger beach-ball frames.')
 } finally {win.destroy();app.quit()}
}).catch(error=>{console.error(error);app.exit(1)})
