'use strict';
// Stable data-folder location outside the movable portable executable.
// Changing folders NEVER deletes, renames or overwrites the source folder.
const fs=require('fs');
const fsp=fs.promises;
const path=require('path');
const crypto=require('crypto');
function manager(app,defaultDir){
 let chosen=null;
 const configFile=()=>path.join(app.getPath('userData'),'clinic-data-location.json');
 function current(){return chosen||path.resolve(defaultDir());}
 function initialise(){
  const file=configFile();
  if(fs.existsSync(file)){
   let content;
   try{content=JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){throw new Error('Saved data folder configuration cannot be read: '+e.message)}
   if(!content||typeof content.path!=='string'||!path.isAbsolute(content.path))throw new Error('Saved data folder path is invalid.');
   if(!fs.existsSync(content.path)||!fs.statSync(content.path).isDirectory())throw new Error('Your selected data folder is unavailable: '+content.path+'. Connect the drive or restore that folder before starting. No new data folder was created.');
   chosen=path.resolve(content.path);
  }
  return current();
 }
 async function checkWritable(dir){
  const proof=path.join(dir,'.clinic-write-test-'+crypto.randomBytes(6).toString('hex'));
  try{await fsp.writeFile(proof,'ok',{flag:'wx'});}finally{await fsp.rm(proof,{force:true}).catch(()=>{});}
 }
 async function describe(destination){
  if(typeof destination!=='string'||!path.isAbsolute(destination))throw new Error('Choose an existing absolute data folder.');
  const root=path.resolve(destination),stat=await fsp.lstat(root);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Choose an ordinary local folder, not a shortcut or file.');
  const src=path.resolve(current());
  if(root===src)return {path:root,kind:'current'};
  // Never copy data to an ancestor or child of the currently active data folder.
  if(root.startsWith(src+path.sep)||src.startsWith(root+path.sep))throw new Error('Choose a folder separate from your current data directory.');
  const entries=await fsp.readdir(root);
  const evidence=['referrals','weekly-reports','Referral_Follow_Up.xlsx','initial-contact','new-patient-setup','exam-cancellations','waitlist'];
  const looksLikeData=entries.some(name=>evidence.includes(name));
  if(entries.length&&!looksLikeData)throw new Error('This folder contains unrelated files. Choose an empty folder or an existing Clinic Tools data folder.');
  await checkWritable(root);
  return {path:root,kind:entries.length?'existing':'empty'};
 }
 async function switchTo(target,mode){
  const d=await describe(target);
  if(d.kind==='current')return {path:current(),mode:'unchanged'};
  if(d.kind==='empty'&&mode!=='copy')throw new Error('An empty destination must receive a copy of your current data.');
  if(d.kind==='existing'&&mode!=='existing')throw new Error('An existing data folder must be selected without copying over its contents.');
  if(mode==='copy'){
   const src=current();
   if(fs.existsSync(src)){
    // The destination already exists (it was selected as an empty folder).
    // On Windows, fs.cp(sourceDirectory, existingDestination, {errorOnExist:true})
    // can fail with ERR_FS_CP_EEXIST even though the destination is empty.
    // Copy each top-level item to a path that does NOT yet exist instead.
    // Preserve the source and never overwrite a destination item.
    for(const name of await fsp.readdir(src)){
      await fsp.cp(path.join(src,name),path.join(d.path,name),{
        recursive:true,force:false,errorOnExist:true,preserveTimestamps:true
      });
    }
    // Remap only paths that pointed INSIDE the old data folder. External
    // Crystal PM/clinic workbooks must retain their original absolute paths.
    for(const rel of ['weekly-reports/settings.json','initial-contact/settings.json',
                      'exam-cancellations/settings.json','waitlist/settings.json']){
      const settingsPath=path.join(d.path,rel);
      if(!fs.existsSync(settingsPath))continue;
      let cfg=JSON.parse(await fsp.readFile(settingsPath,'utf8'));
      if(cfg&&typeof cfg.workbookPath==='string'){
        const old=path.resolve(cfg.workbookPath);
        if(old.startsWith(path.resolve(src)+path.sep)){
          cfg.workbookPath=path.join(d.path,path.relative(src,old));
          await fsp.writeFile(settingsPath,JSON.stringify(cfg,null,2),'utf8');
        }
      }
    }
   }
  }
  await checkWritable(d.path);
  const file=configFile();await fsp.mkdir(path.dirname(file),{recursive:true});
  const tmp=file+'.tmp-'+process.pid;
  try{
   await fsp.writeFile(tmp,JSON.stringify({version:1,path:d.path},null,2),{flag:'wx'});
   await fsp.rename(tmp,file);
  }catch(e){await fsp.rm(tmp,{force:true}).catch(()=>{});throw e;}
  const previous=current();
  chosen=d.path;
  return {path:d.path,mode,previous};
 }
 return {current,initialise,describe,switchTo,configFile};
}
module.exports={manager};
