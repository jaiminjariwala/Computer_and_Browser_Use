// Procedural sphere rendering keeps every animation frame consistent.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { execFileSync } = require('node:child_process')
const output = path.join(__dirname, '../build')
const frames = path.join(output, 'dock-icons')
fs.mkdirSync(frames, { recursive: true })
const table = Array.from({length:256}, (_, n) => {
    let c = n
    for (let k=0;k<8;k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
})
function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data])
    let crc = 0xffffffff
    for (const b of body) crc = table[(crc ^ b) & 255] ^ (crc >>> 8)
    const header = Buffer.alloc(4), tail = Buffer.alloc(4)
    header.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([header, body, tail])
}
function render(size, angle) {
    const raw = Buffer.alloc((size*4+1)*size)
    const colors = [[246,58,64],[248,249,247],[55,112,246],[248,249,247],[250,204,48],[248,249,247]]
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
        const nx=(x+.5-size/2)/(size*.445), ny=(size/2-y-.5)/(size*.445)
        const r2=nx*nx+ny*ny
        if(r2>=1) continue
        const nz=Math.sqrt(1-r2)
        // Tilt the pole toward the viewer and right, as on an inflatable ball.
        const px=.88*nx-.475*ny
        const py=.475*nx+.88*ny
        const pz=.72*nz-.694*py
        const pole=.694*nz+.72*py
        const longitude=Math.atan2(px,pz)+angle
        const sector=((longitude/(Math.PI*2)*6)%6+6)%6
        const base=pole>.978 ? [248,249,247] : colors[Math.floor(sector)]
        const light=Math.max(0,-.38*nx+.48*ny+.79*nz)
        const shine=Math.pow(Math.max(0,-.23*nx+.30*ny+.926*nz),48)*.55
        const seam=Math.min(sector%1,1-sector%1)<.008 ? .96 : 1
        const shade=(.60+.40*light)*seam
        const i=y*(size*4+1)+1+x*4
        for(let c=0;c<3;c++) raw[i+c]=Math.min(255,Math.round(base[c]*shade+(255-base[c]*shade)*shine))
        raw[i+3]=Math.round(Math.min(1,(1-Math.sqrt(r2))*size*.445)*255)
    }
    const header=Buffer.alloc(13)
    header.writeUInt32BE(size); header.writeUInt32BE(size,4); header[8]=8; header[9]=6
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])
}
fs.writeFileSync(path.join(output,'icon-1024.png'),render(1024,0))
for(let i=0;i<48;i++) fs.writeFileSync(path.join(frames,`${String(i).padStart(2,'0')}.png`),render(128,i*Math.PI*2/48))
const iconset=path.join(output,'icon.iconset')
fs.mkdirSync(iconset,{recursive:true})
for(const size of [16,32,128,256,512]) {
    fs.writeFileSync(path.join(iconset,`icon_${size}x${size}.png`),render(size,0))
    fs.writeFileSync(path.join(iconset,`icon_${size}x${size}@2x.png`),render(size*2,0))
}
execFileSync('iconutil',['-c','icns',iconset,'-o',path.join(output,'icon.icns')])
console.log('Generated beach-ball app icon and 48 Dock frames.')
