import numpy as np, trimesh, fast_simplification as fs, time, os, sys
from scipy.spatial import cKDTree
src,dst,target=sys.argv[1],sys.argv[2],int(sys.argv[3])
t=time.time()
sc=trimesh.load(src,force='scene',process=False)
m=list(sc.geometry.values())[0]
print('loaded',len(m.faces),len(m.vertices),m.bounds.round(3).tolist(),round(time.time()-t,1))
im=np.asarray(m.visual.material.baseColorTexture.convert('RGB')); h,w,_=im.shape
uv=m.visual.uv
x=np.clip((uv[:,0]*(w-1)).astype(int),0,w-1); y=np.clip(((1-uv[:,1])*(h-1)).astype(int),0,h-1)
col=im[y,x]; print('texture',im.shape)
V=np.asarray(m.vertices,dtype=np.float64); F=np.asarray(m.faces)
key=np.round(V/(np.ptp(V,axis=0).max()*1e-6)).astype(np.int64)
_,idx,inv=np.unique(key,axis=0,return_index=True,return_inverse=True)
Vw=V[idx]; Fw=inv.reshape(-1)[F]
Pn,Fn=fs.simplify(Vw.astype(np.float32),Fw.astype(np.int32),target_count=target,agg=7)
print('decimated',len(Fn),len(Pn),round(time.time()-t,1))
tree=cKDTree(V); _,nn=tree.query(Pn,k=6); c=col[nn].astype(np.float32).mean(1).astype(np.uint8)
out=trimesh.Trimesh(vertices=Pn,faces=Fn,vertex_colors=np.hstack([c,np.full((len(c),1),255,np.uint8)]),process=False)
out.export(dst); print(os.path.getsize(dst),out.bounds.round(3).tolist())
