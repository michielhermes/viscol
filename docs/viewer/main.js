var viewer ={};
var interface ={};

var urlParam = function(name, w){
  w = w || window;
  var rx = new RegExp('[\&|\?]'+name+'=([^\&\#]+)'),
      val = w.location.search.match(rx);
  return !val ? '':val[1];
}

function loadCubes(){
  viewer.clearAllFrames();
  viewer.loadFilesFromServer(['snaps/snap_0.dat','snaps/snap_1.dat','snaps/snap_2.dat','snaps/snap_3.dat','snaps/snap_4.dat',
                            'snaps/snap_5.dat','snaps/snap_6.dat','snaps/snap_7.dat','snaps/snap_8.dat','snaps/snap_9.dat']);
}


function parseURL(){
  var a=urlParam('slice');
  if(a=='true') {
    viewer.toggleSlice(true);
  } else {
    viewer.toggleSlice(false);
  }

  a=urlParam('zoom');
  if(a){
    viewer.setZoom(a);
  }

  a=urlParam('box');
  if(a=='false') {
    viewer.toggleDrawBox(false);
  } else {
    viewer.toggleDrawBox(true);
  }

  a=urlParam('layers');
  if(a=='true') {
    viewer.toggleHideLayers(true);
  } else {
    viewer.toggleHideLayers(false);
  }

  a=urlParam('URL');
  if(a) {
    var b=a.split(',');
    if(b.length >1){
      console.info(['>1',b]);
      viewer.loadFilesFromServer(b);
    } else{  
      viewer.loadFilesFromServer([a]);
    }  
  }
}

function change(el){
  if(el.id=="webgl-box") viewer.toggleDrawBox(el.checked);
  if(el.id=="webgl-slice") viewer.toggleSlice(el.checked);
  if(el.id=="webgl-hlayers") viewer.toggleHideLayers(el.checked);
  if(el.id=="webgl-sliced") {
    viewer.setSliceDepth(el.value);
    viewer.toggleSlice(true);
  }  
  if(el.id=="webgl-zoom") viewer.setZoom(el.value);
  if(el.id=="webgl-frame") viewer.setFrame(el.value);
  if(el.id=="webgl-layers") {
    viewer.hideLayers(1.5-el.value);
  }  
}

function loadLocal(){
  var el = document.getElementById("webgl-files");
  el.click();
}

function savePNG(){
  viewer.capturePng();
}

function somethingChanged(what){
	if(what){
		for(var i=0;i<what.length;i++){
			var w=what[i];
  		if(w[0]=='hideLayers') {
        var el = document.getElementById("webgl-hlayers");
  			el.checked=w[1];
        el = 1.5-document.getElementById("webgl-layers");
        el = document.getElementById("webgl-hlayers2");
  			el.checked=w[1];
        if(!w[1]) {
          var e = document.getElementById("hideLayersSlider");
          e.style.display='none';
        } else {
          var e = document.getElementById("hideLayersSlider");
          e.style.display='block';
        }
  		}
  		if(w[0]=='zoom') {
        var el = document.getElementById("webgl-zoom");
  			el.value=w[1];
  		}
  		if(w[0] =='sliceDepth') {
        var el = document.getElementById("webgl-sliced");
  			el.value=w[1];
  		}
  		if(w[0] =='slice') {
        var el = document.getElementById("webgl-slice");
  			el.checked=w[1];
        el = document.getElementById("webgl-slice2");
  			el.checked=w[1];
        if(w[1]==false) {
          var e = document.getElementById("sliceDepthSlider");
          e.style.display='none';
        } else {
          var e = document.getElementById("sliceDepthSlider");
          e.style.display='block';
        }
  		}
  		if(w[0] =='dbox') {
        var el = document.getElementById("webgl-box");
  			el.checked=w[1];
  		}
  		if(w[0] =='newFrame') {
        var el = document.getElementById("webgl-frame");
				el.max++;
  		}
  		if(w[0] =='currentFrame') {
        var el = document.getElementById("webgl-frame");
				el.value=w[1];
  		}
      if(w[0] == 'numFrames'){
        var el = document.getElementById("webgl-frame");
				el.max=w[1]-1;
        if(w[1]<=1) {
          var e = document.getElementById("frameSelectSlider");
          e.style.display='none';
        } else {
          var e = document.getElementById("frameSelectSlider");
          e.style.display='block';
        }
      }
		}
	}
}

function setHelp(){
  var el = document.getElementById("keyList");
  var list=viewer.getKeyHelp();
  for(var i=0;i<list.length;i++){
    var entry = document.createElement('li');
    entry.appendChild(document.createTextNode(list[i]));
    el.appendChild(entry);
  }
}

function start() {
  var canvas = document.getElementById("webgl-canvas");
  viewer=new viscol(canvas,"full",somethingChanged);

  function handleFileSelect(evt) {
    var files = evt.target.files; // FileList object
    viewer.loadLocalFiles(files);
    var files = document.getElementById("webgl-files");
    if(files) files.value="";
  }

  var files = document.getElementById("webgl-files");
  if(files) files.addEventListener('change', handleFileSelect, false);

  //set some defaults
  viewer.setZoom(document.getElementById("webgl-zoom").value);
  document.getElementById("webgl-box").checked=true;
  document.getElementById("webgl-slice").checked=false;

  parseURL();
  setHelp();
}
