// main.js
var io = require('socket.io-client');

var socket = io('http://botws.generals.io');

socket.on('disconnect', function() {
	console.error('Disconnected from server.');
	process.exit(1);
});

socket.on('connect', function() {
	console.log('Connected to server.');
	/* Don't lose this user_id or let other people see it!
	 * Anyone with your user_id can play on your bot's account and pretend to be your bot.
	 * If you plan on open sourcing your bot's code (which we strongly support), we recommend
	 * replacing this line with something that instead supplies the user_id via an environment variable, e.g.
	 * var user_id = process.env.BOT_USER_ID;
	 */
	var user_id = '65536';
	var username = '[Bot]ethan';

	// Set the username for the bot.
	// This should only ever be done once. See the API reference for more details.
	socket.emit('set_username', user_id, username);
	socket.emit('stars_and_rank', user_id);

	// Join a custom game and force start immediately.
	// Custom games are a great way to test your bot while you develop it because you can play against your bot!
	var custom_game_id = 'ethan';
	/*socket.emit('join_private', custom_game_id, user_id);
	setTimeout(function(){socket.emit('set_force_start', custom_game_id, true);},5000);
	console.log('Joined custom game at http://bot.generals.io/games/' + encodeURIComponent(custom_game_id));
	console.log('start in 5 second');*/
	socket.emit('join_1v1', user_id);
	// TODO
});

socket.on('stars', function(data) {
	console.log("stars:")
	console.log("1v1:   %d",Math.round(data.duel*10)/10)
});
socket.on('rank', function(data) {
	console.log("rank:")
	console.log("1v1:   %d",data.duel)
});












// Terrain Constants.
// Any tile with a nonnegative value is owned by the player corresponding to its value.
// For example, a tile with value 1 is owned by the player with playerIndex = 1.
var TILE_EMPTY = -1;
var TILE_MOUNTAIN = -2;
var TILE_FOG = -3;
var TILE_FOG_OBSTACLE = -4; // Cities and Mountains show up as Obstacles in the fog of war.

// Game data.
var playerIndex;
var generals;
var cities = [];
var map = [];
var terrain_save = [];
var replay_url;

socket.on('game_start', function(data) {
	// Get ready to start playing the game.
	playerIndex = data.playerIndex;
	socket.emit('chat_message', data.chat_room, "I'm a robot written by ethan, don't kill me plz :)");
	replay_url = 'http://bot.generals.io/replays/' + encodeURIComponent(data.replay_id);
});




var move_queue = new Queue();
var home=-1;
var cnt=0;
var dfs_attack=0;
var last_dis=0;
socket.on('game_update', function(data) {
	// Patch the city and map diffs into our local variables.
	cities = patch(cities, data.cities_diff);
	map = patch(map, data.map_diff);
	generals = data.generals;

	// The first two terms in |map| are the dimensions.
	var width = map[0];
	var height = map[1];
	var size = width * height;
	var land=0;
	var totarmy=0;

	// The next |size| terms are army values.
	// armies[0] is the top-left corner of the map.
	var armies = map.slice(2, size + 2);

	// The last |size| terms are terrain values.
	//terrain[0] is the top-left corner of the map.
	
	var terrain = map.slice(size + 2, size + 2 + size);



	//checkhome
	if(home==-1){
		for(var i=0;i<size;i++){
			terrain_save[i]=-5;//-5==unknown
			if(terrain[i]==playerIndex)
				home=i;
		}
	}

	for(var i=0;i<size;i++){
		if(generals.indexOf(i)>=0 && generals.indexOf(i)!=playerIndex)
			terrain_save[i]=-6;
		else if(terrain[i]>=-2 && terrain[i]<0)//discovered
			terrain_save[i]=terrain[i];//update_new
		else if(terrain[i]>=0){
			if(terrain_save[i]<0 || terrain_save[i]==playerIndex)terrain_save[i]=terrain[i];
		}
		else if(terrain[i]==-4 && terrain_save[i]==-5)
			terrain_save[i]=-4;
		if(terrain[i]==playerIndex){
			land++;
			totarmy+=armies[i];
		}
	}

	if(cnt%5==0){
		console.clear();
		for(var i=0;i<height;i++){
			for(var j=0;j<width;j++){
				if(terrain_save[i*width+j]==-6)
					process.stdout.write(" #")
				else if(terrain_save[i*width+j]==-1 || terrain_save[i*width+j]==-5)
					process.stdout.write("  ");
				else if(terrain_save[i*width+j]==-2 || terrain_save[i*width+j]==-4)
					process.stdout.write(" △");
				else if(terrain_save[i*width+j]==playerIndex)
					process.stdout.write(" ○");
				else
					process.stdout.write(" ■");
			}
			process.stdout.write("\n");
		}
	  console.log("replay:     " + replay_url);
		console.log("playerIndex:%d",playerIndex);
		console.log("home:       line%d column%d",Math.floor(home/width)+1,home%width+1);
		console.log("--");
		console.log("land:       %d",land);
		console.log("armies:     %d",totarmy);
	}
	if(land>10 && cnt%30==0)
			dfs_attack++;
	cnt++;

	var nxptdata=bfsmove(width,height,cities,terrain,home,totarmy<70);
	var nxpt=nxptdata.point;
	var emerg=false;//是否采用wide
	var need=0;
	if(last_dis>nxptdata.d && nxptdata.d<=11 && terrain[nxptdata.point]>=0 && terrain[nxptdata.point]!=playerIndex){
		console.log("[danger] enemies in distance 11!");
		console.log(nxptdata);
		if(last_dis>6){
			while(!move_queue.empty())move_queue.pop();
			socket.emit('clear_moves');
		}
		if(nxptdata.d<=6){
			console.log("--------------------");
			console.log("[danger] enemies in distance 6!");
			console.log("--------------------");
			need=armies[nxpt]+3-armies[home];
			if(need>0)
				nxpt=home;
		}
		emerg=true;
		console.log(nxptdata);
	}
	last_dis=nxptdata.d;
	//console.log(nxptdata);
	if(!emerg && dfs_attack>0 && move_queue.empty()){
			nxpt=home;
			need=Math.floor((totarmy-land)/2);
			console.log("[attack] start dfs attack");
			console.log("gather home:%d",need)
	}
	if(move_queue.empty()){
		if(need==0){
				if(terrain[nxpt]==-1 && armies[nxpt]==0)
						need=3;
				else if(terrain[nxpt]!=playerIndex)
						need=armies[nxpt]+3;
		}
		var arrtmp=gather_army_strict(width,height,armies,terrain,nxpt,need);
		if(emerg && arrtmp.length==0){
			arrtmp=gather_army_wide(width,height,armies,terrain,nxpt,need+20);
			console.log("[danger] no enough army, init wide gather");
		}
		for(var i=arrtmp.length-1;i>=0;i--)
			move_queue.push(arrtmp[i]);
        if(!emerg && dfs_attack>0){
            dfs_attack--;
            dfsmove(width,height);
			/*var printarr=new Array(size);
			for(var i=0;i<size;i++)
				printarr[i]=false;
			while(!move_queue.empty()){
				var curstep=move_queue.pop();
				printarr[curstep.s]=printarr[curstep.s]=true;
				//console.log(Math.floor(curstep.s/width)+" "+curstep.s%width);
			}
			for(var i=0;i<height;i++){
				for(var j=0;j<width;j++)
					if(printarr[i*width+j]==true)
						process.stdout.write(" ■");
					else
						process.stdout.write("  ");
				process.stdout.write("\n");
			}*/
        }
	}
	while(!move_queue.empty()){
		var curstep=move_queue.pop();
		//console.log("%d %d  --->  %d %d",Math.floor(curstep.s/width),curstep.s%width,Math.floor(curstep.t/width),curstep.t%width);
		if(terrain[curstep.t]==-2)continue;
		socket.emit('attack', curstep.s, curstep.t);
		break;
	}

});


socket.on('game_lost', leaveGame);

socket.on('game_won', leaveGame);

function cal_pos(w,h,chk_d,p){
	var size=w*h;
	var tot=0;
	var cnt=0;
	var vis=new Array(size);
	for(var i=0;i<size;i++)
		vis[i]=false;
	vis[p]=true;
	if(terrain_save[p]==-6)
		return 10000;
	if(terrain_save[p]!=-5)
		return 0;

	var q=new Queue();
	q.push({point:p,d:0});
	while(!q.empty()){
		var curdata=q.pop();
		var cur=curdata.point;
		tot++;
		if(terrain_save[cur]==-5)cnt++;
		if(terrain_save[cur]>=0 && terrain_save[cur]!=playerIndex)cnt+=2;
		if(curdata.d==chk_d)continue;
		if(cur%w!=0 && (!vis[cur-1]) && terrain_save[cur-1]!=-2 && terrain_save[cur-1]!=-4){
			vis[cur-1]=true;
			q.push({point:cur-1,d:curdata.d+1});
		}
		if(cur%w!=w-1 && (!vis[cur+1]) && terrain_save[cur+1]!=-2 && terrain_save[cur+1]!=-4){
			vis[cur+1]=true;
			q.push({point:cur+1,d:curdata.d+1});
		}
		if(cur>=w && (!vis[cur-w]) && terrain_save[cur-w]!=-2 && terrain_save[cur-w]!=-4){
			vis[cur-w]=true;
			q.push({point:cur-w,d:curdata.d+1});
		}
		if(cur<size-w && (!vis[cur+w]) && terrain_save[cur+w]!=-2 && terrain_save[cur+w]!=-4){
			vis[cur+w]=true;
			q.push({point:cur+w,d:curdata.d+1});
		}
	}
	var dis=(Math.abs(Math.floor(home/w)-Math.floor(p/w))+Math.abs(home%w-p%w))/10;
	return (tot==0?0:96*cnt/tot)+dis;
}
var dfsvis,mndis,path,finalpath;
function dfsmove(w,h){
	var target=-1,targetpos=-1;
	var size=w*h;
    dfsvis=new Array(size);
    mndis=new Array(size);
    path=new Array(size);
	for(var i=0;i<size;i++){
        dfsvis[i]=false;
        mndis[i]=100000000;
        var curpos=cal_pos(w,h,4,i);
        if(curpos>targetpos){
            targetpos=curpos;
            target=i;
        }
    }
	console.log("possibility:%d",targetpos);
	console.log("place:      %d ,%d number: %d",Math.floor(target/w),target%w,target);
    dfsvis[home]=true;
    mndis[home]=0;
    path[0]=home;
    dfspath(w,h,home,target,0);
    console.log("dis:        %d",mndis[target]);
    for(var i=0;i<finalpath.length-1;i++){
        move_queue.push({s:finalpath[i],t:finalpath[i+1]});
        //console.log(Math.floor(finalpath[i]/w)+" "+finalpath[i]%w);
        //console.log(finalpath[i],finalpath[i+1]);
    }
    for(var i=finalpath.length-1;i>0;i--)
        move_queue.push({s:finalpath[i],t:finalpath[i-1]});
    return {target:target,dis:mndis[target]};
}
function dfspath(w,h,cur,final,step){
    if(cur==final){
        finalpath=new Array(step+1);
        for(var i=0;i<=step;i++)
            finalpath[i]=path[i];
        return;
    }
    if(cur%w!=0 && terrain_save[cur-1]!=-2 && !dfsvis[cur-1] && mndis[cur-1]>mndis[cur]+(terrain_save[cur-1]==-4?500:1)){
        mndis[cur-1]=mndis[cur]+(terrain_save[cur-1]==-4?500:1);
        dfsvis[cur-1]=true;
        path[step+1]=cur-1;
        dfspath(w,h,cur-1,final,step+1);
        dfsvis[cur-1]=false;
    }
    if(cur%w!=w-1 && terrain_save[cur+1]!=-2 && !dfsvis[cur+1] && mndis[cur+1]>mndis[cur]+(terrain_save[cur+1]==-4?500:1)){
        mndis[cur+1]=mndis[cur]+(terrain_save[cur+1]==-4?500:1);
        dfsvis[cur+1]=true;
        path[step+1]=cur+1;
        dfspath(w,h,cur+1,final,step+1);
        dfsvis[cur+1]=false;
    }
    if(cur>=w && terrain_save[cur-w]!=-2 && !dfsvis[cur-w] && mndis[cur-w]>mndis[cur]+(terrain_save[cur-w]==-4?500:1)){
        mndis[cur-w]=mndis[cur]+(terrain_save[cur-w]==-4?500:1);
        dfsvis[cur-w]=true;
        path[step+1]=cur-w;
        dfspath(w,h,cur-w,final,step+1);
        dfsvis[cur-w]=false;
    }
    if(cur<w*h-w && terrain_save[cur+w]!=-2 && !dfsvis[cur+w] && mndis[cur+w]>mndis[cur]+(terrain_save[cur+w]==-4?500:1)){
        mndis[cur+w]=mndis[cur]+(terrain_save[cur+w]==-4?500:1);
        dfsvis[cur+w]=true;
        path[step+1]=cur+w;
        dfspath(w,h,cur+w,final,step+1);
        dfsvis[cur+w]=false;
    }
    return;
}
function gather_army_strict(w,h,army,terr,p,num){
	var move_order=[];

	var size=w*h;
	var army_cnt=0;
	var vis=new Array(size);
	for(var i=0;i<size;i++)
		vis[i]=false;
	vis[p]=true;

	var q=new Queue();
	q.push(p);
	while(!q.empty()){
		var cur=q.pop();
		if(army_cnt>=num)break;
		if(cur%w!=0 && (!vis[cur-1]) && army[cur-1]>0 && terr[cur-1]==playerIndex){
			vis[cur-1]=true;
			q.push(cur-1);
			army_cnt+=army[cur-1]-1;
			move_order.push({s:cur-1,t:cur});
		}
		if(cur%w!=w-1 && (!vis[cur+1]) && army[cur+1]>0 && terr[cur+1]==playerIndex){
			vis[cur+1]=true;
			q.push(cur+1);
			army_cnt+=army[cur+1]-1;
			move_order.push({s:cur+1,t:cur});
		}
		if(cur>=w && (!vis[cur-w]) && army[cur-w]>0 && terr[cur-w]==playerIndex){
			vis[cur-w]=true;
			q.push(cur-w);
			army_cnt+=army[cur-w]-1;
			move_order.push({s:cur-w,t:cur});
		}
		if(cur<size-w && (!vis[cur+w]) && army[cur+w]>0 && terr[cur+w]==playerIndex){
			vis[cur+w]=true;
			q.push(cur+w);
			army_cnt+=army[cur+w]-1;
			move_order.push({s:cur+w,t:cur});
		}
	}
	//for(var i=0;i<move_order.length;i++)
	//	console.log("%d->%d",move_order[i].s,move_order[i].t);
	if(army_cnt>=num)return move_order;
	else return [];
}
function gather_army_wide(w,h,army,terr,p,num){
	var move_order=[];

	var size=w*h;
	var army_cnt=0;
	var vis=new Array(size);
	for(var i=0;i<size;i++)
		vis[i]=false;
	vis[p]=true;

	var q=new Queue();
	q.push(p);
	while(!q.empty()){
		var cur=q.pop();
		if(army_cnt>=num)break;
		if(cur%w!=0 && (!vis[cur-1]) && terr[cur-1]>=-1){
			vis[cur-1]=true;
			q.push(cur-1);
			army_cnt+=(terr[cur-1]==playerIndex?army[cur-1]-1:0);
			move_order.push({s:cur-1,t:cur});
		}
		if(cur%w!=w-1 && (!vis[cur+1]) && terr[cur+1]>=-1){
			vis[cur+1]=true;
			q.push(cur+1);
			army_cnt+=(terr[cur+1]==playerIndex?army[cur+1]-1:0);
			move_order.push({s:cur+1,t:cur});
		}
		if(cur>=w && (!vis[cur-w]) && terr[cur-w]>=-1){
			vis[cur-w]=true;
			q.push(cur-w);
			army_cnt+=(terr[cur-w]==playerIndex?army[cur-w]-1:0);
			move_order.push({s:cur-w,t:cur});
		}
		if(cur<size-w && (!vis[cur+w]) && terr[cur+w]>=-1){
			vis[cur+w]=true;
			q.push(cur+w);
			army_cnt+=(terr[cur+w]==playerIndex?army[cur+w]-1:0);
			move_order.push({s:cur+w,t:cur});
		}
	}
	if(army_cnt>=num)return move_order;
	else return [];
}
function bfsmove(w,h,city,terr,p,ignore_cities){
	var size=w*h;
	var vis=new Array(size);
	for(var i=0;i<size;i++)
		vis[i]=false;
	vis[p]=true;

	var q=new Queue();
	q.push({point:p,d:0});
	while(!q.empty()){
    var curdata=q.pop();
		var cur=curdata.point;
		if(cur%w!=0 && (!vis[cur-1]) && terr[cur-1]!=-2 && (ignore_cities?(city.indexOf(cur-1)<0):1)){
			if(terr[cur-1]==playerIndex){
				vis[cur-1]=true;
				q.push({point:cur-1,d:curdata.d+1});
			}
			else return {point:cur-1,d:curdata.d+1};
		}
		if(cur%w!=w-1 && (!vis[cur+1]) && terr[cur+1]!=-2 && (ignore_cities?(city.indexOf(cur+1)<0):1)){
			if(terr[cur+1]==playerIndex){
				vis[cur+1]=true;
				q.push({point:cur+1,d:curdata.d+1});
			}
			else return {point:cur+1,d:curdata.d+1};
		}
		if(cur>=w && (!vis[cur-w]) && terr[cur-w]!=-2 && (ignore_cities?(city.indexOf(cur-w)<0):1)){
			if(terr[cur-w]==playerIndex){
				vis[cur-w]=true;
				q.push({point:cur-w,d:curdata.d+1});
			}
			else return {point:cur-w,d:curdata.d+1};
		}
		if(cur<size-w && (!vis[cur+w]) && terr[cur+w]!=-2 && (ignore_cities?(city.indexOf(cur+w)<0):1)){
			if(terr[cur+w]==playerIndex){
				vis[cur+w]=true;
				q.push({point:cur+w,d:curdata.d+1});
			}
			else return {point:cur+w,d:curdata.d+1};
		}
	}
	return {point:home,d:0};
}
function Queue() {
    //初始化队列（使用数组实现）
    var items = [];
    //向队列（尾部）中插入元素
    this.push = function(element) {
        items.push(element);
    }
    //从队列（头部）中弹出一个元素，并返回该元素
    this.pop = function() {
        return items.shift();
    }
    //查看队列最前面的元素（数组中索引为0的元素）
    this.front = function() {
        return items[0];
    }
    //查看队列是否为空，如果为空，返回true；否则返回false
    this.empty = function() {
        return items.length == 0;
    }
    //查看队列的长度
    this.size = function() {
        return items.length;
    }
    //查看队列
    this.print = function() {
        //以字符串形势返回
        return items.toString();
    }
}
/* Returns a new array created by patching the diff into the old array.
 * The diff formatted with alternating matching and mismatching segments:
 * <Number of matching elements>
 * <Number of mismatching elements>
 * <The mismatching elements>
 * ... repeated until the end of diff.
 * Example 1: patching a diff of [1, 1, 3] onto [0, 0] yields [0, 3].
 * Example 2: patching a diff of [0, 1, 2, 1] onto [0, 0] yields [2, 0].
 */
function patch(old, diff) {
	var out = [];
	var i = 0;
	while (i < diff.length) {
		if (diff[i]) {  // matching
			Array.prototype.push.apply(out, old.slice(out.length, out.length + diff[i]));
		}
		i++;
		if (i < diff.length && diff[i]) {  // mismatching
			Array.prototype.push.apply(out, diff.slice(i + 1, i + 1 + diff[i]));
			i += diff[i];
		}
		i++;
	}
	return out;
}

function leaveGame() {
	socket.emit('leave_game');
}