// ── Buffer ops ──
    function createBuf(n, l, sr) { return ensureAudioCtx().createBuffer(n, l, sr); }
    function extractRegion(b, s, e) {
      const sr=b.sampleRate, s0=Math.round(s*sr), s1=Math.round(e*sr), len=s1-s0;
      const o=createBuf(b.numberOfChannels,len,sr);
      for(let c=0;c<b.numberOfChannels;c++){const src=b.getChannelData(c),d=o.getChannelData(c);for(let i=0;i<len;i++)d[i]=src[s0+i];}return o;
    }
    function deleteRegion(b, s, e) {
      const sr=b.sampleRate, s0=Math.round(s*sr), s1=Math.round(e*sr), nl=b.length-(s1-s0);
      if(nl<=0)return null; const o=createBuf(b.numberOfChannels,nl,sr);
      for(let c=0;c<b.numberOfChannels;c++){const src=b.getChannelData(c),d=o.getChannelData(c);let w=0;for(let i=0;i<s0;i++)d[w++]=src[i];for(let i=s1;i<b.length;i++)d[w++]=src[i];}return o;
    }
    function insertAudioAt(mb, ib, at) {
      const sr=mb.sampleRate,nc=mb.numberOfChannels,is=Math.round(at*sr);
      const o=createBuf(nc,mb.length+ib.length,sr);
      for(let c=0;c<nc;c++){const m=mb.getChannelData(c),ins=c<ib.numberOfChannels?ib.getChannelData(c):ib.getChannelData(0),d=o.getChannelData(c);let w=0;for(let i=0;i<is;i++)d[w++]=m[i];for(let i=0;i<ins.length;i++)d[w++]=ins[i];for(let i=is;i<mb.length;i++)d[w++]=m[i];}return o;
    }

    // ── WAV encoder ──
    function audioBufferToWavBlob(buf) {
      const nc=buf.numberOfChannels,sr=buf.sampleRate,ba=nc*2,dl=buf.length*ba,tl=44+dl;
      const ab=new ArrayBuffer(tl),v=new DataView(ab);
      const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
      ws(0,'RIFF');v.setUint32(4,tl-8,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);
      v.setUint16(20,1,true);v.setUint16(22,nc,true);v.setUint32(24,sr,true);
      v.setUint32(28,sr*ba,true);v.setUint16(32,ba,true);v.setUint16(34,16,true);
      ws(36,'data');v.setUint32(40,dl,true);
      const chs=[];for(let c=0;c<nc;c++)chs.push(buf.getChannelData(c));
      let off=44;for(let i=0;i<buf.length;i++)for(let c=0;c<nc;c++){let s=Math.max(-1,Math.min(1,chs[c][i]));v.setInt16(off,s<0?s*0x8000:s*0x7FFF,true);off+=2;}
      return new Blob([ab],{type:'audio/wav'});
    }
