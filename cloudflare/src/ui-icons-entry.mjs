import {createElement,UserRound,UsersRound,LogOut,Ellipsis,Download,HardDrive,RefreshCw,GitCompareArrows,ShieldCheck,Clock,X,ArchiveRestore,Archive,Shield,ChevronDown} from 'lucide';
const icons={user:UserRound,users:UsersRound,logout:LogOut,more:Ellipsis,download:Download,storage:HardDrive,retry:RefreshCw,compare:GitCompareArrows,verified:ShieldCheck,clock:Clock,close:X,restore:ArchiveRestore,archive:Archive,persist:Shield,expand:ChevronDown};
window.FTIcons={refresh(root=document){for(const slot of root.querySelectorAll('[data-ft-icon]')){const icon=icons[slot.dataset.ftIcon];if(icon&&!slot.firstChild)slot.append(createElement(icon,{'aria-hidden':'true',width:18,height:18,'stroke-width':1.8}));}}};
window.FTIcons.refresh();
