//Copyright (C) 2012-2017  Michiel Hermes
//
//This program is free software; you can redistribute it and/or
//modify it under the terms of the GNU General Public License
//as published by the Free Software Foundation; either version 2
//of the License, or any later version.
//
//This program is distributed in the hope that it will be useful,
//but WITHOUT ANY WARRANTY; without even the implied warranty of
//MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//GNU General Public License for more details.
//
//You should have received a copy of the GNU General Public License
//along with this program; if not, write to the Free Software
//Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
//

'use strict';

////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

function Parameters(par,onChange){
  var par = par;
  onChange=onChange;
  function get(p){
    return par[p];
  }

  function set(p){
//    console.info("Set :",p);
    var event=[];
    for (var key in p){
      if(par[key] != p[key]){
//        console.info("Setting: ",key,p[key])
        par[key]=p[key];
        event.push([key,p[key]]);
      }
    }
    if(typeof onChange === "function" && event.length > 0) onChange(event);
  }

  function toggle(p){
    var a={};
    a[p]=!par[p];
    set(a);
  }

  return {
    get:get,
    set:set,
    toggle:toggle,
  };
}

////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

function viscol_core(myCanvas,onChange){
  var gl;                        //The webgl context
  var debug=true;                //Debug output to the console
  var shaderPrograms = {};       //Object containing all the different shader programs
  var currentShaderProgram = "triangles"; //The current Shader program
  var mvMatrix = mat4.create();  //model view matrix
  var mvMatrixStack = [];        //To store old matrices
  var pMatrix = mat4.create();   //The projection matrix
  var frames=[];                 //Array containing the frames/scenes
  var shapes = {};               //Object containing the VBO of particle shapes
  var selecting=false;           //Booleon that is true during particle selection
  var parameters= new Parameters({               //All parameters that can be changed and read directly 
    drawFrameTitle:false,
    drawFPS:false,
    scaleParticles:1.0,
    currentFrame:0,
    numFrames:0,
    zoom:0.7,
    animateCall:0,
    getColorCallback:0,
    getVisibilityCallback:0,
    loadText:'Please load a frame.',
    sceneRotationMatrix:mat4.create(),
  },onChange);
  
  //A particle object
  function particle(position,size,color,type,orientation,selectable,shader,lines){
    this.position=position;
    this.size=size;
    this.color=color;
    if(selectable != undefined) this.selectable=selectable; else this.selectable=true;
    if(shader != undefined) this.shader=shader; else this.shader="triangles";
    if(lines != undefined) this.lines=lines; else this.lines=false;
    if(type) this.type=type; else this.type='sphere';
    if(orientation) {
      if(orientation.length==9) 
        this.orientation = mat3.toMat4(orientation);
      else
        this.orientation=orientation; 
    } else this.orientation= [size,0,0,0, 0,size,0,0, 0,0,size,0, 0,0,0,1];
  }

  //A frame object
  function frame(particles,name,title,scale){
    this.particles=particles;
    this.name=name;
    if(title) this.title=title ; else this.title=name;
    if(scale) this.scale=scale ; else scale=1;
  }

  //Shapes loaded into the buffers of the graphics card
  function VBOShape(name,positions,normals,indices,tex){
    this.name=name;
    this.positions=positions;
    this.normals=normals;
    this.indices=indices;
    this.tex=tex;
  }

  //Vertices, normals etc of shapes
  function vshape(name,positions,normals,indices,tex){
    this.name=name;
    this.positions=positions;
    this.normals=normals;
    this.indices=indices;
    if(tex) this.tex=tex; else tex=[];
  }

  function initGL(canvas) {
    var names = ["webgl", "experimental-webgl"];
    gl=null;
    for (var i = 0; i < names.length; i++) {
      try {
        gl= canvas.getContext(names[i]);
      } catch (e) { }
      if (gl) break;
    }  
    if (gl) {
      gl.viewportWidth  = canvas.width;
      gl.viewportHeight = canvas.height;
    } else  
      alert("Could not initialise WebGL");
  }

  function initObjShaders() {
    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    var shaderProgram = gl.createProgram();
    gl.shaderSource(vertexShader, shaderVs);
    gl.compileShader(vertexShader);
    gl.attachShader(shaderProgram, vertexShader);
    gl.shaderSource(fragmentShader, shaderFs);
    gl.compileShader(fragmentShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    //Attributes
    shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "a_position");
    gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
    shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "a_normal");
    gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);

    //Uniforms
    shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "u_PMatrix");
    shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "u_MVMatrix");
    shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "u_NMatrix");
    shaderProgram.colorUniform = gl.getUniformLocation(shaderProgram, "u_Color");

    //Add our program to the list of programs
    shaderPrograms["triangles"]= shaderProgram;
  }

  function initLineShaders() {
    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    var shaderProgram = gl.createProgram();
    gl.shaderSource(vertexShader, shaderLinesVs);
    gl.compileShader(vertexShader);
    gl.attachShader(shaderProgram, vertexShader);
    gl.shaderSource(fragmentShader, shaderLinesFs);
    gl.compileShader(fragmentShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    //Attributes
    shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "a_position");
    gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

    //Uniforms
    shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "u_PMatrix");
    shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "u_MVMatrix");
    shaderProgram.colorUniform = gl.getUniformLocation(shaderProgram, "u_Color");

    //Add our program to the list of programs
    shaderPrograms["lines"]= shaderProgram;
  }

  function initTextShaders() {
    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    var shaderProgram = gl.createProgram();
    gl.shaderSource(vertexShader, shaderTextVs);
    gl.compileShader(vertexShader);
    gl.attachShader(shaderProgram, vertexShader);
    gl.shaderSource(fragmentShader, shaderTextFs);
    gl.compileShader(fragmentShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    //Attributes
    shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "a_position");
    gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
    shaderProgram.vertexNormalAttribute = gl.getAttribLocation(shaderProgram, "a_normal");
    gl.enableVertexAttribArray(shaderProgram.vertexNormalAttribute);
    shaderProgram.vertexTexCoordAtt = gl.getAttribLocation(shaderProgram, "a_texcoord");
    gl.enableVertexAttribArray(shaderProgram.vertexTexCoordAtt);

    //Uniforms
    shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, "u_PMatrix");
    shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, "u_MVMatrix");
    shaderProgram.textureUniform = gl.getUniformLocation(shaderProgram,"u_texture");
    shaderProgram.nMatrixUniform = gl.getUniformLocation(shaderProgram, "u_NMatrix");

    //Add our program to the list of programs
    shaderPrograms["text"]= shaderProgram;
  }

  function initShaders() {
    initObjShaders();
    initLineShaders();
    initTextShaders();
  }

  function setShaderProgram(shader){
    currentShaderProgram=shader;
    gl.useProgram(shaderPrograms[shader]);

    if(shader == "triangles" || shader== "text"){ //I do not really understand why we need this
      gl.enableVertexAttribArray(shaderPrograms["triangles"].vertexNormalAttribute);
      gl.enableVertexAttribArray(shaderPrograms["text"].vertexNormalAttribute);
    } else {
      gl.disableVertexAttribArray(shaderPrograms["triangles"].vertexNormalAttribute);
      gl.disableVertexAttribArray(shaderPrograms["text"].vertexNormalAttribute);
    }  

    if(shader== "text"){                      //I do not really understand why we need this
      gl.enableVertexAttribArray(shaderPrograms["text"].vertexTexCoordAtt); 
    } else {
      gl.disableVertexAttribArray(shaderPrograms["text"].vertexTexCoordAtt); 
    }
  }

  function mvPushMatrix() {
    var copy = mat4.create();
    mat4.set(mvMatrix, copy);
    mvMatrixStack.push(copy);
  }

  function mvPopMatrix() {
    if (mvMatrixStack.length == 0) {
      throw "Invalid popMatrix!";
    }
    mvMatrix = mvMatrixStack.pop();
  }

  function setMatrixUniforms() { 
    //Pass the projection matrix to the shaders
    gl.uniformMatrix4fv(shaderPrograms[currentShaderProgram].pMatrixUniform, false, pMatrix);

    //Pass the model view matrix to the shaders
    gl.uniformMatrix4fv(shaderPrograms[currentShaderProgram].mvMatrixUniform, false, mvMatrix);

    //Calculate and pass the normal matrix to the shaders
    if(currentShaderProgram=="triangles" || currentShaderProgram=="text"){ //only if we need normals
      var normalMatrix = mat3.create();
      mat4.toInverseMat3(mvMatrix, normalMatrix);
      mat3.transpose(normalMatrix);
      gl.uniformMatrix3fv(shaderPrograms[currentShaderProgram].nMatrixUniform, false, normalMatrix);
    } 
  }

  var currentBuffer="";
  function setBuffers(name){
    if(!shapes[name]) {
      if(debug) console.info("ERROR can not find shape:"+name);
      return;
    }
    if(currentBuffer==name) return;
    currentBuffer=name;
    gl.bindBuffer(gl.ARRAY_BUFFER, shapes[name].positions);
    gl.vertexAttribPointer(shaderPrograms[currentShaderProgram].vertexPositionAttribute, 
        shapes[name].positions.itemSize, gl.FLOAT, false, 0, 0);

    if(currentShaderProgram=="triangles" || currentShaderProgram=="text") { //only pass normals if we need them
      gl.bindBuffer(gl.ARRAY_BUFFER, shapes[name].normals);
      gl.vertexAttribPointer(shaderPrograms[currentShaderProgram].vertexNormalAttribute, 
          shapes[name].normals.itemSize, gl.FLOAT, false, 0, 0);
    }  
    
    if(currentShaderProgram=="text") { //only pass texture coordinates if we need them
      gl.bindBuffer(gl.ARRAY_BUFFER, shapes[name].tex);
      gl.vertexAttribPointer(shaderPrograms[currentShaderProgram].vertexTexCoordAtt, 
          shapes[name].tex.itemSize, gl.FLOAT, false, 0, 0);
    }

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shapes[name].indices);
  }

  function drawByName(name,lines) {
    if(shapes[name]){
      setBuffers(name);
      setMatrixUniforms();
      if(lines)
        gl.drawElements(gl.LINES, shapes[name].indices.numItems, gl.UNSIGNED_SHORT, 0);
      else
        gl.drawElements(gl.TRIANGLES, shapes[name].indices.numItems, gl.UNSIGNED_SHORT, 0);
    } else if(debug) {
      console.info("Do not know shape: "+name);
    }
  }

  // Puts text on a canvas.
  var textCtx = document.createElement("canvas").getContext("2d");
  function makeTextCanvas(text, width, height) {
    textCtx.canvas.width  = width;
    textCtx.canvas.height = height;
    textCtx.font = "20px Arial";
    textCtx.textAlign = "left";
    textCtx.textBaseline = "top";
    textCtx.clearRect(0, 0, width, height);
    textCtx.fillStyle = "rgba(0,0,0,255)";
    var textHeight=20;
    var rows=text.split('\n');
    if(!rows) return;
    for(var i=0;i<rows.length;i++){
       textCtx.fillText(rows[i], 1, 1+i*textHeight);
    }
    return textCtx.canvas;
  }

  var texture = {};
  var oldText='';
  function initTexture(text){
    makeTextCanvas(text,512,512);
    texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCtx.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  function drawText(text){
    if(!shapes["TEXT"]) {if(debug) console.info("ERROR Could not find shape TEXT."); return; }

    var mytext=text;
    var cf=parameters.get("currentFrame");
    if(cf >= 0 && cf < frames.length) {
      if(parameters.get("drawFrameTitle")) mytext+=mytext+frames[cf].title+'\n';
    }
    if(parameters.get("drawFPS")) mytext+=lastFPS+'\n';

    if(mytext!=oldText){
      initTexture(mytext);
      oldText=mytext;
    }    
    
    if(mytext != ''){
      mvPushMatrix();
      mat4.translate(mvMatrix, [-1.0,1.0,100.0]);
      mat4.scale(mvMatrix,[2.0*textCtx.canvas.width/gl.canvas.width,2.0*textCtx.canvas.height/gl.canvas.height,1.0]);

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(shaderPrograms[currentShaderProgram].textureUniform, texture);

      setMatrixUniforms();
      setBuffers("TEXT");
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawElements(gl.TRIANGLES, shapes["TEXT"].indices.numItems, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.BLEND);
      mvPopMatrix();
    }
  }
  
  function drawFrameBox(box) {
    mvPushMatrix();
    mat4.scale(mvMatrix,[box[0],box[1],box[2]]);
    gl.uniform3f(shaderPrograms[currentShaderProgram].colorUniform, 0.1,0.1,0.1);

    setBuffers('BOX');
    setMatrixUniforms();
    gl.drawElements(gl.LINES, shapes["BOX"].indices.numItems, gl.UNSIGNED_SHORT, 0);

    mvPopMatrix();
  }

/*  function parameters.get(p){
    return parameters[p];
  }

  function parameters.set(p){
    var update=[];
    for (var key in p){
      parameters[key]=p[key];
      update.push([key,p[key]]);
    }
    if(typeof parameters.parameterCallback === "function" && update) parameters.parameterCallback(update);
  }*/

  function showParticle(i){
    var cf=parameters.get("currentFrame");
    if(!frames[cf]) return false;
    if(typeof parameters.get("getVisibilityCallback") === "function") {
      return parameters.get("getVisibilityCallback")(i,frames[cf].particles[i],cf);
    } else return true;
  }

  function getColor(i){
    var color=[0,0,0];
    var cf =parameters.get("currentFrame");
    if(selecting) {
      color= [(Math.floor(i/65536)%256)/255,
              (Math.floor(i/256)%256)/255,
              (i%256)/255]
    } else if(typeof parameters.get("getColorCallback") === "function") {
      color=parameters.get("getColorCallback")(i,frames[cf].particles[i],cf);
    } else {
      color=frames[cf].particles[i].color;
    }
    return color;
  }

  function setColor(color){
    gl.uniform3f(shaderPrograms[currentShaderProgram].colorUniform, color[0],color[1],color[2]);
  }

  function drawScene() {
    //Clear
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    currentBuffer="";  //forces a reload of the buffers which seems to be required for a new frame.

    //Viewport
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

    //Projection matrix
    var f=gl.viewportWidth/gl.viewportHeight;
    if(f<1)
      mat4.ortho(-1.0,1.0,-1.0/f,1.0/f,-100, 100.0, pMatrix);
    else
      mat4.ortho(-1.0*f,1.0*f,-1.0,1.0,-100, 100.0, pMatrix);

    //Model view matrix
    mat4.identity(mvMatrix);
    mat4.multiply(mvMatrix, parameters.get("sceneRotationMatrix"));
    var zoom=parameters.get("zoom");
    mat4.scale(mvMatrix,[zoom,zoom,zoom]);

    var cf=parameters.get("currentFrame");
    if(cf < 0) if(frames.length > 0) cf=0;
    if(cf >= frames.length) if(frames.length > 0) cf=frames.length-1;

    //Draw the particles
    if(cf >= 0 && cf < frames.length){
      if(selecting) setShaderProgram("lines");
      var part=frames[cf].particles;
      //Grow arrays if needed.
//      while(selected.length < part.length) selected.push(false);
//      while(visible.length < part.length) visible.push(true);
      //
      for(var i=0;i<part.length;i++){
        if(!selecting || (selecting && part[i].selectable)) if(showParticle(i)){
          if(!selecting && currentShaderProgram != part[i].shader) setShaderProgram(part[i].shader);
          setColor(getColor(i));
          mvPushMatrix();
          mat4.translate(mvMatrix, part[i].position);
          mat4.multiply(mvMatrix,part[i].orientation);
//          mat4.scale(mvMatrix,[parameters.scaleParticles,parameters.scaleParticles,parameters.scaleParticles]);
          drawByName(part[i].type,part[i].lines);
          mvPopMatrix();
        }
      }
      if(!selecting) { 
        //For the text
        mat4.identity(mvMatrix);
        setShaderProgram("text");
        mat4.ortho(-1.0,1.0,-1.0,1.0,-100, 100.0, pMatrix);
        drawText('');
      }
    } else { 
      //For the loading text
      mat4.identity(mvMatrix);
      setShaderProgram("text");
      mat4.ortho(-1.0,1.0,-1.0,1.0,-100, 100.0, pMatrix);
      drawText(parameters.get("loadText"));
    }   
  }

  var pickerFramebuffer = null;
  var pickerTexture = null;
  var pickerRenderbuffer = null;

  function initPicker(){
  	var width  = gl.canvas.width;
  	var height = gl.canvas.height;
	
	//1. Init Picking Texture
  	pickerTexture = gl.createTexture();
  	gl.bindTexture(gl.TEXTURE_2D, pickerTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
	
	//2. Init Render Buffer
  	pickerRenderbuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, pickerRenderbuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    
  //3. Init Frame Buffer
    pickerFramebuffer = gl.createFramebuffer();
  	gl.bindFramebuffer(gl.FRAMEBUFFER, pickerFramebuffer);
  	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pickerTexture, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, pickerRenderbuffer);

	//4. Clean up
  	gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function selectParticle(x,y){
    var buf = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pickerFramebuffer); //Switch to off-screen framebuffer
    selecting=true;
    drawScene();                                           //Draw each particle with a unique color
    selecting=false;
    gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE, buf);  //Read the color of the pixel
    gl.bindFramebuffer(gl.FRAMEBUFFER,null)                //Switch back to on-screen framebuffer
    var i=buf[0]*256*256+buf[1]*256+buf[2];                //Obtain the particle number from the color
    if(!frames[parameters.get("currentFrame")]) {
      i=-1;
    } else if(i<0 || i >= frames[parameters.get("currentFrame")].particles.length){
      i=-1;
    }
    return i;
  }

  var fpsFrameCount=0;
  var fpsLastTime=0;
  var lastFPS=0;
  function fps(){
    var now = new Date().getTime()/1000;
    fpsFrameCount++;
    var elapsedTime = (now - fpsLastTime);
    if(elapsedTime >= 1.0) {
      var fps = fpsFrameCount/elapsedTime;
      lastFPS=fps.toFixed(2);
      fpsFrameCount = 0;
      fpsLastTime = now;
    }
  }

  function resizeCanvas(){
    var ratio = 1;//window.devicePixelRatio;

    // Compute the size needed to make our drawingbuffer match the canvas in real pixels. 
    var displayWidth  = Math.floor(gl.canvas.clientWidth  * ratio);
    var displayHeight = Math.floor(gl.canvas.clientHeight * ratio);

    // Check if the canvas has the correct size.
    if (gl.canvas.width  !== displayWidth || gl.canvas.height !== displayHeight) {
      // Make the canvas the same size
      gl.canvas.width  = displayWidth;
      gl.canvas.height = displayHeight;
    }
    if(gl.canvas.width  != gl.viewportWidth || gl.canvas.height != gl.viewportHeight){
      gl.viewportWidth  = gl.canvas.width;
      gl.viewportHeight = gl.canvas.height;
      initPicker();
    }  
  }

  function tick() {
    requestAnimationFrame(tick);
    resizeCanvas();
    drawScene();
    fps();
    var cb = parameters.get("animateCall");
    if(cb){
      if(typeof cb === "function") cb();
    }
  }

  function addFrame(nframe,pos){
    if(arguments.length==1){
      if(nframe){
        frames.push(nframe);
        parameters.set({numFrames:frames.length});
      }
    } else if(arguments.length==2 && nframe){
      if(pos < frames.length && pos >= 0){
        frames[pos]= nframe;
      }
    }
  }

  function addShape(shape){
    if(!shapes.hasOwnProperty(shape.name)){ 
      var vertexNormalBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexNormalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shape.normals), gl.STATIC_DRAW);
      vertexNormalBuffer.itemSize = 3;
      vertexNormalBuffer.numItems = shape.normals.length / 3;

      var vertexPositionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shape.positions), gl.STATIC_DRAW);
      vertexPositionBuffer.itemSize = 3;
      vertexPositionBuffer.numItems = shape.positions.length / 3;

      var vertexIndexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vertexIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(shape.indices), gl.STATIC_DRAW);
      vertexIndexBuffer.itemSize = 1;
      vertexIndexBuffer.numItems = shape.indices.length;

      var vertexTexCoordBuffer = [];
      if(shape.tex){
        vertexTexCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexTexCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shape.tex), gl.STATIC_DRAW);
        vertexTexCoordBuffer.itemSize = 2;
        vertexTexCoordBuffer.numItems = shape.tex.length/2;
      }  

      shapes[shape.name]=( new VBOShape(shape.name,vertexPositionBuffer,vertexNormalBuffer,vertexIndexBuffer,vertexTexCoordBuffer));
    }
  }

  function clearAllFrames(){
    frames=[];
    parameters.set({numFrames:0});
  }

  function clearCurrentFrame(){
    var cf = parameters.get("currentFrame");
    frames.splice(cf,1);
    parameters.set({numFrames:frames.length});
    if(cf >= frames.length) {
      parameters.set({currentFrame:frames.length-1});
    }
  }

  function initText() {
    var vertexPositionData = [];
    var normalData = [];
    var indexData = [];
    var texData = [];

    vertexPositionData.push( 0,-1, 0); normalData.push(0,0,1);texData.push(0,1);
    vertexPositionData.push( 0, 0, 0); normalData.push(0,0,1);texData.push(0,0);
    vertexPositionData.push( 1, 0, 0); normalData.push(0,0,1);texData.push(1,0);
    vertexPositionData.push( 1,-1, 0); normalData.push(0,0,1);texData.push(1,1);

    indexData.push(0,1,2);  
    indexData.push(0,2,3);
    addShape(new vshape('TEXT',vertexPositionData,normalData,indexData,texData));
  }

  function initBox(){
    var vertices = [
      1, 1, 1,
     -1, 1, 1,
     -1,-1, 1,
      1,-1, 1,
      1, 1,-1,
     -1, 1,-1,
     -1,-1,-1,
      1,-1,-1
    ];

    var indices = [
      0,1, 1,2, 2,3, 3,0,
      4,5, 5,6, 6,7, 7,4,
      0,4, 1,5, 2,6, 3,7
    ];

    addShape(new vshape('BOX',vertices,[],indices));

  }


  function webGLStart() {
    var canvas = myCanvas;
    if(canvas){
      initGL(canvas);

      initShaders();
      
      initPicker();
      initTexture('');
      initText();
      initBox();
      parameters.set({sceneRotationMatrix:mat4.identity()});

      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      gl.enable(gl.DEPTH_TEST);

      tick();
    } else alert("ERROR: Canvas not found!");
  }

  webGLStart();
  return { //all public functions
    particle:particle,
    addShape:addShape,

    parameters:parameters,

    frame:frame,
    addFrame:addFrame,
    clearCurrentFrame:clearCurrentFrame,
    clearAllFrames:clearAllFrames,

    selectParticle:selectParticle,

    frames:frames,
  };
};//END viscol


////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

function viscol(myCanvas,type,callback){
  var colorTable=[[0.8,0.8,0.8],[0.0,0.8,0.8],[0.8,0.0,0.8],[0.8,0.8,0.0],[0.8,0.0,0],[0.0,0.8,0.0],[0.0,0.0,0.8]];
  var vertexShapes = new myShapes(6);
  var shapes = {};
  var viscol= new viscol_core(myCanvas,parameterChangeEvent);
  var canvas=myCanvas;
  var type=type;
  var callback=callback;
  if(type == undefined) type="static";
  var selected =[];
  var visible =[];
  var parameters = new Parameters({
    xspeed:0.0,
    yspeed:0.0,
    hideR:-1.0,
    hideLayers:false,
    sliceDepth:0,
    slice:false,
    play:false,
    playDelay:30,
  },parameterChangeEvent);

  function parameterChangeEvent(event){
//    console.info(event[0]);
    if(typeof callback === "function") callback(event);
  }

  function color(i,part,cf){
    if(i==0) return part.color; //bounding box is not selectable
    while(selected.length <= i) selected.push(false);
    if (selected[i])
      //return [1-colorTable[0][0],1-colorTable[0][1],1-colorTable[0][2]];
      return [0.6*colorTable[0][0],0.6*colorTable[0][1],0.6*colorTable[0][2]];
    else
      return part.color;
  }

  function isVisible(i,part,cf){
    while(visible.length <= i) visible.push(true);

    if(i==0) return visible[0]; //always show the bounding box

    if(!visible[i]) return false;
    
    var pos = part.position;
    var hideR=parameters.get("hideR");
    var cut=pos[0]*pos[0]+pos[1]*pos[1]+pos[2]*pos[2] < hideR*hideR || !parameters.get("hideLayers");
    var mat=viscol.parameters.get("sceneRotationMatrix");
    var sslice= mat[2]*pos[0] + mat[6]*pos[1]+mat[10]*pos[2] < -parameters.get("sliceDepth") || !parameters.get("slice");
    return cut && sslice;
  }

  function hideHalf(){
    console.info("hh?");
    var cf= viscol.parameters.get("currentFrame");
    if(!viscol.frames[cf]) return;
    for(var i=0;i<viscol.frames[cf].particles.length;i++){
      visible[i] =  isVisible(i,viscol.frames[cf].particles[i],cf);
    }
    parameters.set({slice:false});
  }

  var hideColor=0;
  function selectByColor(step){
    var cf = viscol.parameters.get("currentFrame");
    var part=viscol.frames[cf].particles;
    var found=false;
    var count=0;
    while(!found && count <colorTable.length){
      for(var i=0;i<part.length;i++){
        if(part[i].color == colorTable[hideColor]) {
          selected[i]=true;
          found=true;
        } else {
          selected[i]=false;
        }
      }
      hideColor+=step;
      count++;
      if(hideColor >= colorTable.length) hideColor=0;
      if(hideColor < 0) hideColor=colorTable.length-1;
    }
  }

  function hideSelected(){
    for(var i=1;i<selected.length;i++){
      if(selected[i]) visible[i]=false;
    }
  }

  function invertSelection(){
    for(var i=1;i<selected.length;i++){
      selected[i]=!selected[i];
    }
  }

  function selectAll(){
    for(var i=1;i<selected.length;i++){
      selected[i]=true;
    }
  }

  function unselectAll(){
    for(var i=1;i<selected.length;i++){
      selected[i]=false;
    }
  }

  function unhideAll(){
    for(var i=1;i<visible.length;i++){
      visible[i]=true;
    }
  }


  function saveAs(uri, filename) {
    var link = document.createElement('a');
    if (typeof link.download === 'string') {
      link.href = uri;
      link.download = filename;

      //Firefox requires the link to be in the body
      document.body.appendChild(link);

      //simulate click
      link.click();

      //remove the link when done
      document.body.removeChild(link);
    } else {
      window.open(uri);
    }
  }

  var captureNow=false;
  var capturer = null;
  var captureCount=0;
  function captureMovie(nframes){
    var cf=viscol.parameters.get("currentFrame");
    var movieName=viscol.frames[cf].name;
    movieName = movieName.replace(/\\/g, ''); //remove backslash from name
    movieName = movieName.replace(/\//g, ''); //remove slash from name
    if(typeof CCapture ==="function") capturer =  new CCapture( { format: 'png' ,name: movieName} );
    if(capturer){
      captureNow=true;
      if(nframes) captureCount=nframes; else captureCount=2*Math.PI/0.02;
      capturer.start();
    } else alert('CCapture did not load?'); 
  }

  var capturePNG=false;
  function savePNG(data){
    data = data.replace(/^data:image\/[^;]/, 'data:application/octet-stream');
    saveAs(data,"image.png")
  }

  var capturePNG=false;
  function capturePng(){
    capturePNG=true;
  }

  function stopMovie(){
    capturer.stop();
    capturer.save();
    captureNow=false;
    captureCount=0;
    parameters.set({play:false});
    parameters.set({playDelay:10});
  }

  function captureMoviePlay(){
    viscol.parameters.set({currentFrame:0});
    parameters.set({play:true});
    parameters.set({playDelay:1});
    captureMovie(viscol.frames.length);
  }

  function loadFromVar(v){
    viscol.addFrame(parseTextFile(v.data,v.name));
  }

  function loadLocalFiles(files){
    var cf = viscol.parameters.get("numFrames");
    for (var i = 0, f; f = files[i]; i++) {
    var reader = new FileReader();
      reader.file=f;
      reader.onload = (function(theFile) {
        return function(e){
          viscol.addFrame(parseTextFile(e.target.result,theFile.name));
        }
      })(f);
      reader.readAsText(f);
    }
    viscol.parameters.set({currentFrame:cf});
  }

  function loadFilesFromServer(urls) {
    if(arguments.length != 1) return;
    if(!(urls.constructor === Array)) urls=[urls];
    var pos=viscol.parameters.get("numFrames");
    for(var i=0;i<urls.length;i++){
      (function(i){ //to make sure the i in the onload function is not the outer loop one
        var xhr;
        viscol.addFrame(new viscol.frame([],urls[i])); //to avoid a random order of files due to asynchronous functions
                                            //place an empty frame at the right position in the array
        if(i==0) viscol.parameters.set({currentFrame:pos});
        xhr = new XMLHttpRequest();
        xhr.overrideMimeType("text/plain"); //to stop de default xml parser
        xhr.onerror = function () {alert('ERROR: Could not load file: '+urls[i]);}
        xhr.onload = function () {
          if(this.responseText != null) {
            viscol.addFrame(parseTextFile(this.responseText,urls[i]),pos+i); //overwrite empty frame 
          } else alert('ERROR: Could not load file: '+urls[i]);
        }
//        xhr.onreadystatechange = function (oEvent) {
//          if(xhr.readyState == 4 && !(xhr.status ==200 || xhr.status == 0)) alert('ERROR: Could not load file: '+urls[i]);
//        }
         
        xhr.open("GET", urls[i], true);
        xhr.send();
      })(i);
    }  
  }

  function loadZip(url){
    if(!url) return;
    if(typeof JSZipUtils == 'undefined') return;
    JSZipUtils.getBinaryContent(url, function(err, data) {
      if(err) throw err; 

      JSZip.loadAsync(data).then(function(zip) {
        zip.forEach(function (relativePath, zipEntry) {
          zip.file(zipEntry.name).async("string").then(function (data) {
            viscol.addFrame(parseTextFile(data,zipEntry.name));
          });
        });
      }, function (e) {
        alert("Error reading zip: " + e.message);
      });

    });
  }

  function parseTextFile(text,fileName) {
    var c=text.split('\n');
    if(c.length<5) alert("ERROR, No particles in file?");

    //number of particles and title are on line 0
    var a = (c[0]).match(/([\-,0-9]*) (.*)/);
    var n=0;      //defaults values
    var title='';
    if(a && a.length >= 2){
      n=parseInt(a[1]);
      if(a.length >=3) title=a[2];
    } else {
      n=parseInt(c[0]);
    }

    //box size
    var box_a=[];
    var box_b=[];
    for(var i=1;i<4;i++){
      var a=c[i].replace(/^\s+/,'').split(/\s+/);
      if(a.length==1){
        box_a.push(0.0);
        box_b.push(parseFloat(a[0]));
      } else if(a.length>=2){
        box_a.push(parseFloat(a[0]));
        box_b.push(parseFloat(a[1]));
      } else {
        box_a.push(0.0);
        box_b.push(1.0);
      } 
    }

    var boxSize=[];
    var boxCentre=[];
    for(i=0;i<3;i++){
      boxSize.push(box_b[i]-box_a[i]);
      boxCentre.push(0.5*(box_b[i]+box_a[i]));
    }

    var f = 2.0/Math.max(boxSize[0],boxSize[1],boxSize[2]);
    for(var i=0;i<boxCentre.length;i++) {box_a[i]-=boxCentre[i];box_b[i]-=boxCentre[i];}
    for(var i=0;i<box_a.length;i++) box_a[i]*=f;

    var particles= [];
    var m=[box_a[0],0,0,
           0,box_a[1],0,
           0,0,box_a[2]];
    //The first particle is the box.
    particles.push(new viscol.particle([0,0,0],1.2,[0.0,0.0,0.0],'BOX',m,false,"lines",true));

    //The particles
    for (var i=4;i<c.length;i++) if(c[i]){
      var ctrim=c[i].trim();
      if(/^[A-z].*/.test(ctrim)) { //if the line starts with text instead of a number
        var a=ctrim.split(/\s+/);
        if(a.length>=4){
          var name = a[0].toLowerCase();
          var position = [
            (parseFloat(a[1])-boxCentre[0])*f,
            (parseFloat(a[2])-boxCentre[1])*f,
            (parseFloat(a[3])-boxCentre[2])*f]; // position in column 1,2,3
          var size=f; //set defaults
          var color=colorTable[1]; 
          var mat=null; 
          if(a.length>= 13){
            mat = [parseFloat(a[4])*f ,parseFloat(a[5])*f ,parseFloat(a[6]*f),
                   parseFloat(a[7])*f ,parseFloat(a[8])*f ,parseFloat(a[9]*f),
                   parseFloat(a[10])*f,parseFloat(a[11])*f,parseFloat(a[12]*f)];
          }
          if(a.length == 14) {
            var cc = parseInt(a[13]) % colorTable.length;
            if(cc>=0 && cc <colorTable.length) color = colorTable[cc];
          }
          if(a.length>= 16){
            color = [parseFloat(a[13])*1.4 ,parseFloat(a[14])*1.4 ,parseFloat(a[15])*1.4];
          }
          particles.push(new viscol.particle(position,size,color,name,mat));
          if(!shapes.hasOwnProperty(name)){ //if shape does not exist
            vertexShapes.makeShape(name,viscol.addShape);
            shapes[name]=name;
          }  
        }
      } else { //assume a sphere if no type specified
        var a=ctrim.split(/\s+/);
        if(a.length>=3){
          var position = [
            (parseFloat(a[0])-boxCentre[0])*f,
            (parseFloat(a[1])-boxCentre[1])*f,
            (parseFloat(a[2])-boxCentre[2])*f]; // position in column 0,1,2
          var size=f;
          if(a.length>= 4)
            size=parseFloat(a[3])*f; //size in column 3 
          var color=colorTable[1]; 
          if(a.length >= 5) {
            var cc = parseInt(a[4]) % colorTable.length;
            if(cc>=0 && cc <colorTable.length) color = colorTable[cc];
          }
          if(a.length>= 7)
            color = [parseFloat(a[4])*1.4 ,parseFloat(a[5])*1.4 ,parseFloat(a[6])*1.4];
          particles.push(new viscol.particle(position,size,color,'sphere',0));
          if(!shapes.hasOwnProperty('sphere')){ //if shape does not exist
            vertexShapes.makeShape('sphere',viscol.addShape);
            shapes['sphere']='sphere';
          }  
        }
      }
    }

    if(n+1 != particles.length) 
      alert("Number of particles does not match with file header!\n"+ n.toString() +'!='+particles.length.toString());

    return new viscol.frame(particles,fileName,title,f);
  }

  var mouseDown = false;
  var lastMouseX = [];
  var mouseDownX = [];
  var currentlyPressedKeys = {};
  var keybindings = [];

  function keybinding(keys, f, params, help){
    this.keys=keys;
    this.f=f;
    this.params=params;
    if(arguments.length >= 4 ) 
      this.help=help;
    else 
      this.help='';
  }

  function get2DCoords(event) {
    var rect = canvas.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;
		y = canvas.height - y;
		return {x:x,y:y};
  }

  function handleMouseUp(event) {
    mouseDown = false;
    var dx=mouseDownX[0]-event.clientX;
    var dy=mouseDownX[1]-event.clientY;
    if(type !="fixed" && type != "static"){
      if(dx==0 && dy==0){
        var coords = get2DCoords(event);
        var i = viscol.selectParticle(coords.x,coords.y);
        if(i>=0){
          selected[i]=!selected[i];
  	  	  console.info('Clicked: '+i.toString());
        }
      }  
    }
  }

  function handleMouseMove(event) {
    if (!mouseDown) {
      return;
    }
    var newX = event.clientX;
    var newY = event.clientY;

    var deltaX = newX - lastMouseX[0]
    var deltaY = newY - lastMouseX[1];
    if(Math.abs(deltaX) >0 || Math.abs(deltaY) >0){
      var s=200/canvas.height;
      setSpeed([0,0]);
      rotate([deltaX*s,deltaY*s]);
      lastMouseX[0] = newX
      lastMouseX[1] = newY;
    }  
  }

  function handleMouseLeave(event){
    if(mouseDown) mouseDown = false;
  }

  function initDropInterface(){
    //Drag and drop files
    function handleDrop(evt) {
      evt.stopPropagation();
      evt.preventDefault();
      var files = evt.dataTransfer.files; // FileList object.
      loadLocalFiles(files);
    }

    function handleDragOver(evt) {
      evt.stopPropagation();
      evt.preventDefault();
      evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
    }

    // Setup the drag and drop listeners.
    canvas.addEventListener('dragover', handleDragOver, false);
    canvas.addEventListener('drop', handleDrop, false);
  }

  function handleKeys() {
    for(var i=0;i<keybindings.length;i++){
      var keys=keybindings[i].keys;
      var trigger=true;
      for(var j=0;j<keys.length;j++){
        if(!currentlyPressedKeys[keys[j]]) trigger=false;
      }
      if(trigger) {
        if(keybindings[i].params.length == 0)
          keybindings[i].f();
        else
          keybindings[i].f(keybindings[i].params);
        break; //to avoid handling the same key twice
      }
    }
  }

  function handleKeyDown(event) {
    currentlyPressedKeys[event.keyCode] = true;
    handleKeys();
    event.preventDefault();
  }

  function handleKeyUp(event) {
    currentlyPressedKeys[event.keyCode] = false;
    event.preventDefault();
  }

  function handleMouseDown(event) {
    mouseDown = true;
    lastMouseX = [event.clientX,event.clientY];
    mouseDownX = [event.clientX,event.clientY];
  }

  function mouseWheelHandler(event){
    var delta = Math.max(-1, Math.min(1, (event.wheelDelta || -event.detail)));
    if(delta>0) zoomIn(1.05); else zoomIn(1.0/1.05);
    event.preventDefault();
  }

  var ongoingTouches=[];
  function mytouch(startX,startY,id){
    this.newX=startX;
    this.newY=startY;
    this.lastX=startX;
    this.lastY=startY;
    this.dx=0;
    this.dy=0;
    this.id=id;
  }

  function handleTouchStart(evt) {
    evt.preventDefault();
    var touches = evt.changedTouches;

    for (var i = 0; i < touches.length; i++) {
      ongoingTouches.push(new mytouch(touches[i].pageX,touches[i].pageY,touches[i].identifier));
    }
  }

	function handleTouchMove(evt) {
		evt.preventDefault();
		var touches = evt.changedTouches;

		for (var i = 0; i < touches.length; i++) {
		  for (var j = 0; j < ongoingTouches.length; j++) {
        if(ongoingTouches[j].id==touches[i].identifier){
          ongoingTouches[j].lastX=ongoingTouches[j].newX;
          ongoingTouches[j].lastY=ongoingTouches[j].newY;
          ongoingTouches[j].newX=touches[i].pageX;
          ongoingTouches[j].newY=touches[i].pageY;
          ongoingTouches[j].dx =ongoingTouches[j].newX-ongoingTouches[j].lastX;
          ongoingTouches[j].dy =ongoingTouches[j].newY-ongoingTouches[j].lastY;
        }
      }
		}
    if(ongoingTouches.length==1){
      rotate([ongoingTouches[0].dx*0.2,ongoingTouches[0].dy*0.2]);
    } else if(ongoingTouches.length==2){
      //zoom
      var lastDist = Math.sqrt(Math.pow(ongoingTouches[0].lastX - ongoingTouches[1].lastX,2) +
                             + Math.pow(ongoingTouches[0].lastY - ongoingTouches[1].lastY,2));
      var newDist  = Math.sqrt(Math.pow(ongoingTouches[0].newX  - ongoingTouches[1].newX,2) +
                             + Math.pow(ongoingTouches[0].newY  - ongoingTouches[1].newY,2));

      var z = newDist/lastDist;
      zoomIn(z);

      //rotation
      var lastTheta = Math.atan2(ongoingTouches[0].lastX-ongoingTouches[1].lastX,
                                 ongoingTouches[0].lastY-ongoingTouches[1].lastY);
      var newTheta  = Math.atan2(ongoingTouches[0].newX -ongoingTouches[1].newX,
                                 ongoingTouches[0].newY -ongoingTouches[1].newY);
      rotate([0,0,(newTheta-lastTheta)*100]);

    } else {
      console.info("Do not know what to do with 3 or more touches...");
    }
	}
  
	function handleTouchEnd(evt) {
		evt.preventDefault();
		var touches = evt.changedTouches;

		for (var i = 0; i < touches.length; i++) {
		  for (var j = 0; j < ongoingTouches.length; j++) {
        if(ongoingTouches[j].id==touches[i].identifier){
          ongoingTouches.splice(j,1);
        }
			}
		}
	}

	function handleTouchCancel(evt) {
		evt.preventDefault();
		console.info("touchcancel.");
    handleTouchEnd(evt);
	}

  function bindAllKeys(){
    //Keybindings inclusing more than one key should be inserted first. 
    keybindings.push(new keybinding([67,16],selectByColor, -1,'(C) Select by color (only for integer colors).'));
    keybindings.push(new keybinding([67],selectByColor, 1,'(c) Select by color (only for integer colors).'));
    keybindings.push(new keybinding([37,16],rotate90, [0,-1],'(Shift + Left) Rotate left 90.'));
    keybindings.push(new keybinding([37],incSpeed,[0,-1],'(Left) Rotate left.'));
    keybindings.push(new keybinding([40,16],rotate90, [1,0],'(Shift + Down) Rotate down 90.'));
    keybindings.push(new keybinding([40],incSpeed,[1,0],'(Down) Rotate down.'));
    keybindings.push(new keybinding([39,16],rotate90, [0,1],'(Shift + Right) Rotate up 90.'));
    keybindings.push(new keybinding([39],incSpeed,[0,1],'(Right) Rotate right.'));
    keybindings.push(new keybinding([38,16],rotate90,[-1,0],'(Shift + Up) Rotate up 90.'));
    keybindings.push(new keybinding([38],incSpeed,[-1,0],'(Up) Rotate up.'));
    keybindings.push(new keybinding([32,16],resetView,[],'(Shift + Space) Reset view.'));
    keybindings.push(new keybinding([32],setSpeed,[0,0],'(Space) Stop rotation.'));
    keybindings.push(new keybinding([109],zoomIn,[1.0/1.05],'(keypad -) Zoom out.'));
    keybindings.push(new keybinding([107],zoomIn,[1.05],'(keypad +) Zoom in.'));
    keybindings.push(new keybinding([173],zoomIn,[1.0/1.05],'(-) Zoom out.'));
    keybindings.push(new keybinding([61,16],zoomIn,[1.05],'(+) Zoom in.'));
    if(type != "fixed"){
      keybindings.push(new keybinding([76,16],unhideAll, [],'(L) Unhide all particles'));
      keybindings.push(new keybinding([83,16],unselectAll,[],'(S) Deselect all particles.'));
      keybindings.push(new keybinding([72,16],unhideAll, [],'(H) Unhide all.'));
      keybindings.push(new keybinding([73],invertSelection, [],'(i) Invert selection.'));
      keybindings.push(new keybinding([90],hideHalf, [],'(z) Hide the particles closest to the camera.'));
      keybindings.push(new keybinding([72],hideSelected, [],'(h) Hide selected.'));

      keybindings.push(new keybinding([188],incSliceDepth, [-1],'(,) Decrease slice depth.'));
      keybindings.push(new keybinding([190],incSliceDepth, [1],'(.) Increase slice depth.'));
      keybindings.push(new keybinding([46],clearCurrentFrame, [],'(del) Delete current frame.'));
      keybindings.push(new keybinding([76],toggleHideLayers, [],'(l) hide outer layer.'));
      keybindings.push(new keybinding([192],toggleDrawFPS, [],'(`) Toggle drawing of the FPS counter.'));
      keybindings.push(new keybinding([66],toggleDrawBox, [],'(b) Toggle the drawing of the simulation box.'));
      keybindings.push(new keybinding([84],toggleFrameTitle,[],'(t) Toggle display of the frame title.'));
      keybindings.push(new keybinding([83],toggleSlice,[],'(s) Toggle show slice view.'));
      keybindings.push(new keybinding([221],nextFrame,[],'(]) Next frame.'));
      keybindings.push(new keybinding([219],prevFrame,[],'([) Previous frame.'));
    }
  }

  function bind() {
    if(canvas){
      if(type != "fixed")
        initDropInterface();

      if(type != "static"){
        canvas.onmousedown = handleMouseDown;
        canvas.onmouseup = handleMouseUp; 
        canvas.onmousemove = handleMouseMove;
        canvas.tabIndex = 1000; //Otherwise canvas does not know what to do with keys
        canvas.onkeydown = handleKeyDown;
        canvas.onkeyup = handleKeyUp;
        canvas.onmouseleave = handleMouseLeave;

        canvas.addEventListener("touchstart", handleTouchStart, false);
        canvas.addEventListener("touchend", handleTouchEnd, false);
        canvas.addEventListener("touchcancel", handleTouchCancel, false);
        canvas.addEventListener("touchmove", handleTouchMove, false);

        if (canvas.addEventListener) {
        // IE9, Chrome, Safari, Opera
          canvas.addEventListener("mousewheel", mouseWheelHandler, false);
        // Firefox
          canvas.addEventListener("DOMMouseScroll", mouseWheelHandler, false);
        }
        // IE 6/7/8
        else canvas.attachEvent("onmousewheel", mouseWheelHandler);

        bindAllKeys();
      }

      //Animation
      viscol.parameters.set({animateCall:animate});

      //Selecting and visibility
      viscol.parameters.set({getVisibilityCallback:isVisible});
      viscol.parameters.set({getColorCallback:color});
    }
  }

  function getKeyHelp(){
    var help=[];
    for(var i=0;i<keybindings.length;i++){
      help.push(keybindings[i].help);
    }
    return help;
  }

  function toggleDrawBox(val){
    if(arguments.length==1) 
      visible[0]=val;
    else   
      visible[0]=!visible[0];
  }

  function setZoom(szoom){
		if(szoom>0.01 && szoom <10) viscol.parameters.set({zoom:szoom});
  }

  function incSpeed(step){
    //parameters.xspeed += step[0];
    //parameters.yspeed += step[1];
    parameters.set({xspeed:parameters.get("xspeed")+step[0]});
    parameters.set({yspeed:parameters.get("yspeed")+step[1]});
  }

  function setSpeed(speed){
    parameters.set({xspeed:speed[0]});
    parameters.set({yspeed:speed[1]});
  }

  function setPlayDelay(val){
    if(arguments.length==1){
      parameters.set({playDelay:val});
    }
  }

  function togglePlay(val){
    if(arguments.length==1){
      parameters.set({play:val});
    } else {
      parameters.toggle("play");
    }
  }

  function toggleDrawFPS(val) {
    if(arguments.length==1)
      viscol.parameters.set({drawFPS:val});
    else 
      viscol.parameters.set({drawFPS:!viscol.parameters.get("drawFPS")});
  }
   
  function toggleFrameTitle(val){
    if(arguments.length==1)
      viscol.parameters.set({drawFrameTitle:val});
    else 
      viscol.parameters.set({drawFrameTitle:!viscol.parameters.get("drawFrameTitle")});
  }

  function zoomIn(step){
    var zoom= viscol.parameters.get("zoom");
    if(zoom*step > 0.01 && zoom*step < 10) viscol.parameters.set({zoom:zoom*step});
  }


  function animRotate(){
    var newRotationMatrix = mat4.create();
    var sceneRotationMatrix=viscol.parameters.get("sceneRotationMatrix");
    mat4.identity(newRotationMatrix);

    mat4.rotate(newRotationMatrix, parameters.get("xspeed")*0.02, [1, 0, 0]);
    mat4.rotate(newRotationMatrix, parameters.get("yspeed")*0.02, [0, 1, 0]);
    mat4.multiply(newRotationMatrix, sceneRotationMatrix, sceneRotationMatrix);
    viscol.parameters.set({sceneRotationMatrix:sceneRotationMatrix});
  }

  var frameCounterPlay=0;
  function animPlay(){
    if(parameters.get("play")){
      frameCounterPlay++;
      if(frameCounterPlay>=parameters.get("playDelay")){
        frameCounterPlay=0;
        var currentFrame=viscol.parameters.get("currentFrame");
        if(currentFrame < viscol.frames.length-1) 
          viscol.parameters.set({currentFrame:currentFrame+1});
        else 
          viscol.parameters.set({currentFrame:0});
      }
    }
  }

  function animate(){
    animRotate();
    animPlay();

    if(capturePNG) {
      capturePNG=false;
      savePNG(canvas.toDataURL("image/png",1));
    }

    if(captureNow) {
      capturer.capture(canvas);
      captureCount--;
      if(captureCount <= 0) stopMovie();
    }  
  }

  function rotate(dxy){
    var newRotationMatrix = mat4.create();
    mat4.identity(newRotationMatrix);
    if(dxy.length >= 1)
      mat4.rotate(newRotationMatrix, dxy[0]*0.02, [0, 1, 0]);
    if(dxy.length >= 2)
      mat4.rotate(newRotationMatrix, dxy[1]*0.02, [1, 0, 0]);
    if(dxy.length >= 3)
      mat4.rotate(newRotationMatrix, dxy[2]*0.02, [0, 0, 1]);

    var sceneRotationMatrix=viscol.parameters.get("sceneRotationMatrix");
    mat4.multiply(newRotationMatrix, sceneRotationMatrix, sceneRotationMatrix);
    viscol.parameters.set({sceneRotationMatrix:sceneRotationMatrix});
  }

  function rotate90(xy){
    var newRotationMatrix = mat4.create();
    mat4.identity(newRotationMatrix);
    mat4.rotate(newRotationMatrix, xy[0]*Math.PI*0.5, [1, 0, 0]);
    mat4.rotate(newRotationMatrix, xy[1]*Math.PI*0.5, [0, 1, 0]);
    var sceneRotationMatrix=viscol.parameters.get("sceneRotationMatrix");
    mat4.multiply(newRotationMatrix, sceneRotationMatrix, sceneRotationMatrix);
    viscol.parameters.set({sceneRotationMatrix:sceneRotationMatrix});
  }

  function resetView(){
    var sceneRotationMatrix = mat4.create();
    mat4.identity(sceneRotationMatrix);
    setSpeed([0,0]);
    viscol.parameters.set({sceneRotationMatrix:sceneRotationMatrix});
    viscol.parameters.set({zoom:0.7});
  }

  function setFrame(n){
    if(arguments.length==1){
      var nf=viscol.parameters.get("numFrames");
      var n=parseInt(n);
      if( n < nf && n >=0) viscol.parameters.set({currentFrame:n});
    }
  }

  function nextFrame(){
    var cf=viscol.parameters.get("currentFrame");
    var nf=viscol.parameters.get("numFrames");
    if( cf < nf-1) viscol.parameters.set({currentFrame:cf+1});
  }

  function prevFrame(){
    var cf=viscol.parameters.get("currentFrame");
    if( cf >0) viscol.parameters.set({currentFrame:cf-1});
  }

  function setSliceDepth(val){
    if(arguments.length==1){
      parameters.set({sliceDepth:val});
    }
  }
  
  function incSliceDepth(step){
    if(arguments.length==1){
      toggleSlice(true);
      var sd= parameters.get("sliceDepth");
      if(sd+step*0.01 > -2.0 && sd+step*0.01 < 2.0)
        parameters.set({sliceDepth:sd+step*0.01});
    }
  }
  
  function toggleSlice(val){
    if(arguments.length==1) {
      parameters.set({slice:val});
    } else {
      parameters.toggle("slice");
    }
  }

  function toggleHideLayers(val){
    if(arguments.length==1){
      parameters.set({hideLayers:val});
    } else {
      parameters.toggle("hideLayers");
    }
  }

  function setHideLayers(hideR){
    parameters.set({hideR:hideR});
    parameters.set({hideLayers:true});
  }

  function clearAllFrames(){
    viscol.clearAllFrames();
  }

  function clearCurrentFrame(){
    viscol.clearCurrentFrame();
  }

  bind();
  return {
    clearAllFrames:clearAllFrames,
    loadLocalFiles:loadLocalFiles,
    clearCurrentFrame:clearCurrentFrame,
    toggleHideLayers:toggleHideLayers,
    hideLayers:setHideLayers,
    loadFilesFromServer:loadFilesFromServer,
    getKeyHelp:getKeyHelp,
    toggleDrawBox:toggleDrawBox,
    setZoom:setZoom,
    setSpeed:setSpeed,
    incSpeed:incSpeed,
    togglePlay:togglePlay,
    setPlayDelay:setPlayDelay,
    toggleFrameTitle:toggleFrameTitle,
    toggleDrawFPS:toggleDrawFPS,
    zoomIn:zoomIn,
    rotate90:rotate90,
    resetView:resetView,
    prevFrame:prevFrame,
    nextFrame:nextFrame,
    setFrame:setFrame,
    setSliceDepth:setSliceDepth,
    incSliceDepth:incSliceDepth,
    toggleSlice:toggleSlice,
    loadFromVar:loadFromVar,

    selectAll:selectAll,
    unselectAll:unselectAll,
    invertSelection:invertSelection,
//    selectByColor:selectByColor,
    hideHalf:hideHalf,
    unhideAll:unhideAll,
    hideSelected:hideSelected,

    captureMovie:captureMovie,
    captureMoviePlay:captureMoviePlay,
    capturePng:capturePng,
    colorTable:colorTable,
  };

}; //END interface

////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

var myShapes =  function(lod){
  var shapes = [];
  var lod=lod;

  function vshape(name,positions,normals,indices,tex){
    this.name=name;
    this.positions=positions;
    this.normals=normals;
    this.indices=indices;
    if(tex) this.tex=tex; else tex=[];
  }

  function loadFromUrl(url,name,callWhenFinished){
    if(arguments.length != 3) return;
    (function(url,name){
      var xhr = new XMLHttpRequest();
      xhr.overrideMimeType("text/plain"); //to stop de default xml parser
      xhr.onerror = function () {alert('ERROR: Could not load file: '+url);}
      xhr.onload = function () {
        if(this.responseText != null) {
          var shape = loadFromObj(this.responseText,name);
          callWhenFinished(shape);
        } else alert('ERROR: Could not load file: '+url);
      }
//      xhr.onreadystatechange = function (oEvent) {
//        if(xhr.readyState == 4 && !(xhr.status ==200 || xhr.status == 0)) alert('ERROR: Could not load file: '+url);
//      }
       
      xhr.open("GET", url, true);
      xhr.send();
    })(url,name);
  }

  function loadFromObj(text,name){
    //console.info(name);
    //Reads wavefront .obj files to load a shape
    var vertexPositionData = [];
    var normalData = [];
    var indexData = [];

    var faces = [];
    var vertices = [];
    var normals = [];

    var c=text.split('\n'); //split text file line wise
    for(var n=0;n<c.length;n++){
      var a = (c[n]).match(/^v (.*)/); //vertex
      if(a && a.length >= 2){
        var s=a[1].trim().split(/\s+/);
        if(s && s.length == 3)
          vertices.push([parseFloat(s[0]),parseFloat(s[1]),parseFloat(s[2])]);
        else console.info("Err parsing obj vertex ",a);
      } 
      a = (c[n]).match(/^vn (.*)/); //vertex normal
      if(a && a.length >= 2){ 
        var s=a[1].trim().split(/\s+/);
        if(s && s.length == 3)
          normals.push([parseFloat(s[0]),parseFloat(s[1]),parseFloat(s[2])]);
        else console.info("Err parsing obj vertex normal",a);
      }
      a = (c[n]).match(/^f (.*)/); //face
      if(a && a.length >= 2){
        var s=a[1].trim().split(/\s+/);
        if(s && s.length == 3) {
          var face=[];
          for(var j=0;j<s.length;j++){
            var s2=s[j].split('\/');
            if(s2 && s2.length >=3)
              face.push([parseInt(s2[0]),parseInt(s2[2])]);
            else console.info("Err parsing obj face",a);
          }
          faces.push(face);
        }
        else console.info("Err parsing obj face",a);
      }
    }

    if(faces.length*3 >= 65536 && vertices.length==normals.length) { 
      //allows loading of the stanford bunny without overflowing the 16bit indices 
      for(var i=0;i<vertices.length;i++) {
        vertexPositionData.push(vertices[i][0]); 
        vertexPositionData.push(vertices[i][1]); 
        vertexPositionData.push(vertices[i][2]); 
      }
      for(var i=0;i<normals.length;i++) {
        normalData.push(normals[i][0]); 
        normalData.push(normals[i][1]); 
        normalData.push(normals[i][2]);
      }
      for(var i=0;i<faces.length;i++) {
        for(var j=0;j<3;j++)
          indexData.push(faces[i][j][1]-1);
      }
      
    } else { //general case 
      var k=0;
      for(var i=0;i<faces.length;i++){
        for(var j=0;j<3;j++){
          vertexPositionData.push(vertices[faces[i][j][0]-1][0]); 
          vertexPositionData.push(vertices[faces[i][j][0]-1][1]); 
          vertexPositionData.push(vertices[faces[i][j][0]-1][2]); 
          normalData.push(normals[faces[i][j][1]-1][0]);
          normalData.push(normals[faces[i][j][1]-1][1]);
          normalData.push(normals[faces[i][j][1]-1][2]);
          indexData.push(k);
          k++;
        }  
      }
    }
    return new vshape(name,vertexPositionData,normalData,indexData);
  }

  function initCube() {
    var vertexPositionData = [];
    var normalData = [];
    var indexData = [];

    vertexPositionData.push( 0.5,-0.5, 0.5); normalData.push(1,0,0);
    vertexPositionData.push( 0.5,-0.5,-0.5); normalData.push(1,0,0);
    vertexPositionData.push( 0.5, 0.5,-0.5); normalData.push(1,0,0);
    vertexPositionData.push( 0.5, 0.5, 0.5); normalData.push(1,0,0);
    indexData.push(0,1,2);  indexData.push(0,2,3);
    vertexPositionData.push(-0.5,-0.5, 0.5); normalData.push(-1,0,0);
    vertexPositionData.push(-0.5,-0.5,-0.5); normalData.push(-1,0,0);
    vertexPositionData.push(-0.5, 0.5,-0.5); normalData.push(-1,0,0);
    vertexPositionData.push(-0.5, 0.5, 0.5); normalData.push(-1,0,0);
    indexData.push(4,5,6);  indexData.push(4,6,7);
    vertexPositionData.push(-0.5, 0.5, 0.5); normalData.push(0,1,0);
    vertexPositionData.push(-0.5, 0.5,-0.5); normalData.push(0,1,0);
    vertexPositionData.push( 0.5, 0.5,-0.5); normalData.push(0,1,0);
    vertexPositionData.push( 0.5, 0.5, 0.5); normalData.push(0,1,0);
    indexData.push(8,9,10);  indexData.push(8,10,11);
    vertexPositionData.push(-0.5,-0.5, 0.5); normalData.push(0,-1,0);
    vertexPositionData.push(-0.5,-0.5,-0.5); normalData.push(0,-1,0);
    vertexPositionData.push( 0.5,-0.5,-0.5); normalData.push(0,-1,0);
    vertexPositionData.push( 0.5,-0.5, 0.5); normalData.push(0,-1,0);
    indexData.push(12,13,14);  indexData.push(12,14,15);
    vertexPositionData.push(-0.5, 0.5, 0.5); normalData.push(0,0,1);
    vertexPositionData.push(-0.5,-0.5, 0.5); normalData.push(0,0,1);
    vertexPositionData.push( 0.5,-0.5, 0.5); normalData.push(0,0,1);
    vertexPositionData.push( 0.5, 0.5, 0.5); normalData.push(0,0,1);
    indexData.push(16,17,18);  indexData.push(16,18,19);
    vertexPositionData.push(-0.5, 0.5,-0.5); normalData.push(0,0,-1);
    vertexPositionData.push(-0.5,-0.5,-0.5); normalData.push(0,0,-1);
    vertexPositionData.push( 0.5,-0.5,-0.5); normalData.push(0,0,-1);
    vertexPositionData.push( 0.5, 0.5,-0.5); normalData.push(0,0,-1);
    indexData.push(20,21,22);  indexData.push(20,22,23);

    return new vshape('cube',vertexPositionData,normalData,indexData);
  }

  function addQuad(vertex,normal,index,quad){
    var vl=vertex.length/3;
    if(quad.length==4){
      vertex.push(quad[0][0],quad[0][1],quad[0][2]);
      vertex.push(quad[1][0],quad[1][1],quad[1][2]);
      vertex.push(quad[2][0],quad[2][1],quad[2][2]);
      vertex.push(quad[3][0],quad[3][1],quad[3][2]);
      var v1 = new vec3.create();
      vec3.subtract(quad[0],quad[1],v1);
      var v2 = new vec3.create();
      vec3.subtract(quad[0],quad[2],v2);
      var n=new vec3.create();
      vec3.cross(v1,v2,n);
      vec3.normalize(n);
      normal.push(n[0],n[1],n[2]);
      normal.push(n[0],n[1],n[2]);
      normal.push(n[0],n[1],n[2]);
      normal.push(n[0],n[1],n[2]);
      index.push(vl,vl+1,vl+2);
      index.push(vl+1,vl+2,vl+3);
    }
    if(quad.length==3){
      vertex.push(quad[0][0],quad[0][1],quad[0][2]);
      vertex.push(quad[1][0],quad[1][1],quad[1][2]);
      vertex.push(quad[2][0],quad[2][1],quad[2][2]);
      var v1 = new vec3.create();
      vec3.subtract(quad[0],quad[1],v1);
      var v2 = new vec3.create();
      vec3.subtract(quad[0],quad[2],v2);
      var n=new vec3.create();
      vec3.cross(v1,v2,n);
      vec3.normalize(n);
      normal.push(n[0],n[1],n[2]);
      normal.push(n[0],n[1],n[2]);
      normal.push(n[0],n[1],n[2]);
      index.push(vl,vl+1,vl+2);
    }
  }

  function initArrow(name) {
    var tmp = name.match(/\((.*)\)/)[1];
    var length = parseFloat(tmp);
    if(length == NaN) length = 2.0;

    var vertexPositionData = [];
    var normalData = [];
    var indexData = [];

    var al=0.0;
    var bl=length-1.5;
    var sq=Math.sqrt(0.5);
    var r=0.5;
    if(bl<1.5) {
      bl=0.5*length;
      r*=bl/1.5;
    }  

    addQuad(vertexPositionData,normalData,indexData,
     [[r  ,-r , al],
      [-r  ,-r , al],
      [r  , r , al],
      [-r  , r , al]
     ]);

    addQuad(vertexPositionData,normalData,indexData,
     [[r  ,-r , bl],
      [r  ,-r , al],
      [r  , r , bl],
      [r  , r , al]
     ]);

    addQuad(vertexPositionData,normalData,indexData,
     [[-r  ,-r , bl],
      [-r  , r , bl],
      [-r  ,-r , al],
      [-r  , r , al]
     ]);

    addQuad(vertexPositionData,normalData,indexData,
     [[-r  , r , bl],
      [ r  , r , bl],
      [-r  , r , al],
      [ r  , r , al]
     ]);

    addQuad(vertexPositionData,normalData,indexData,
     [[-r  ,-r , bl],
      [-r  ,-r , al],
      [ r  ,-r , bl],
      [ r  ,-r , al]
     ]);

    addQuad(vertexPositionData,normalData,indexData,
     [[-r*2  , r , bl],
      [-r*2  ,-r , bl],
      [ 0    , r , length],
      [ 0    ,-r , length]
     ]);

    addQuad(vertexPositionData,normalData,indexData,
     [[ r*2  , r , bl],
      [ 0    , r , length],
      [ r*2  ,-r , bl],
      [ 0    ,-r , length]
     ]);

    addQuad(vertexPositionData,normalData,indexData,
     [[ r*2  , r , bl],
      [ r*2  ,-r , bl],
      [-r*2  , r , bl],
      [-r*2  ,-r , bl]
     ]);

    addQuad(vertexPositionData,normalData,indexData,
     [[-r*2  , r , bl],
      [ 0    , r , length],
      [ r*2  , r , bl]
     ]);

    addQuad(vertexPositionData,normalData,indexData,
     [[-r*2  , -r , bl],
      [ r*2  , -r , bl],
      [ 0    , -r , length]
     ]);

    return new vshape(name,vertexPositionData,normalData,indexData);
  }

  function initRCube(name) {
    var tmp = name.match(/\((.*)\)/)[1];
    var s = parseFloat(tmp);
    if(s == NaN) s = 0.5;
    if(s<0) s=0.0;
    if(s>1) s=1.0;
    if(s==1) { //in case of perfect cubes
      for(var i=0;i<shapes.length;i++) if(shapes[i].name=='cube') 
        shapes.push(new vshape(name,shapes[i].positions,shapes[i].normals,shapes[i].indices))
    }
    if(s==0) { //in case of perfect spheres
      for(var i=0;i<shapes.length;i++) if(shapes[i].name=='sphere')
        shapes.push(new vshape(name,shapes[i].positions,shapes[i].normals,shapes[i].indices))
    }
    var vertexPositionData = [];
    var normalData = [];
    var indexData = [];
    var l=0.5;
    var q=l-(1-s)*0.5;
    var r=(1-s)*0.5;

    //The 6 faces of the cube
    vertexPositionData.push( l,-q, q); normalData.push(1,0,0);
    vertexPositionData.push( l,-q,-q); normalData.push(1,0,0);
    vertexPositionData.push( l, q,-q); normalData.push(1,0,0);
    vertexPositionData.push( l, q, q); normalData.push(1,0,0);
    indexData.push(0,1,2);  indexData.push(0,2,3);
    vertexPositionData.push(-l,-q, q); normalData.push(-1,0,0);
    vertexPositionData.push(-l,-q,-q); normalData.push(-1,0,0);
    vertexPositionData.push(-l, q,-q); normalData.push(-1,0,0);
    vertexPositionData.push(-l, q, q); normalData.push(-1,0,0);
    indexData.push(4,5,6);  indexData.push(4,6,7);
    vertexPositionData.push(-q, l, q); normalData.push(0,1,0);
    vertexPositionData.push(-q, l,-q); normalData.push(0,1,0);
    vertexPositionData.push( q, l,-q); normalData.push(0,1,0);
    vertexPositionData.push( q, l, q); normalData.push(0,1,0);
    indexData.push(8,9,10);  indexData.push(8,10,11);
    vertexPositionData.push(-q,-l, q); normalData.push(0,-1,0);
    vertexPositionData.push(-q,-l,-q); normalData.push(0,-1,0);
    vertexPositionData.push( q,-l,-q); normalData.push(0,-1,0);
    vertexPositionData.push( q,-l, q); normalData.push(0,-1,0);
    indexData.push(12,13,14);  indexData.push(12,14,15);
    vertexPositionData.push(-q, q, l); normalData.push(0,0,1);
    vertexPositionData.push(-q,-q, l); normalData.push(0,0,1);
    vertexPositionData.push( q,-q, l); normalData.push(0,0,1);
    vertexPositionData.push( q, q, l); normalData.push(0,0,1);
    indexData.push(16,17,18);  indexData.push(16,18,19);
    vertexPositionData.push(-q, q,-l); normalData.push(0,0,-1);
    vertexPositionData.push(-q,-q,-l); normalData.push(0,0,-1);
    vertexPositionData.push( q,-q,-l); normalData.push(0,0,-1);
    vertexPositionData.push( q, q,-l); normalData.push(0,0,-1);
    indexData.push(20,21,22);  indexData.push(20,22,23);

    //Cylindrical parts ->
    for(var xx=-1;xx<=1;xx+=1) for(var yy=-1;yy<=1;yy+=1) for(var zz=-1;zz<=1;zz+=1)
    if((xx==0 && yy!=0 && zz!=0)|| (xx!=0 && yy==0 && zz!=0)||(xx!=0 && yy!=0 && zz==0)){
      var k=vertexPositionData.length/3;
      var offs = [0.5*s*xx,0.5*s*yy,0.5*s*zz];
      for(var i=0;i<=lod;i++){
        var a=0.5*Math.PI*i/lod;
        if(zz==0){
          vertexPositionData.push(Math.sin(a)*r*xx+offs[0],Math.cos(a)*r*yy+offs[1], 0.5*s+offs[2]);  normalData.push(Math.sin(a)*xx,Math.cos(a)*yy,0.0);
          vertexPositionData.push(Math.sin(a)*r*xx+offs[0],Math.cos(a)*r*yy+offs[1],-0.5*s+offs[2]);  normalData.push(Math.sin(a)*xx,Math.cos(a)*yy,0.0);
        } else if (yy==0){
          vertexPositionData.push(Math.sin(a)*r*xx+offs[0], 0.5*s+offs[1],Math.cos(a)*r*zz+offs[2]); normalData.push(Math.sin(a)*xx,0.0,Math.cos(a)*zz);
          vertexPositionData.push(Math.sin(a)*r*xx+offs[0],-0.5*s+offs[1],Math.cos(a)*r*zz+offs[2]); normalData.push(Math.sin(a)*xx,0.0,Math.cos(a)*zz);
        } else if (xx==0){
          vertexPositionData.push( 0.5*s+offs[0],Math.sin(a)*r*yy+offs[1],Math.cos(a)*r*zz+offs[2]); normalData.push(0.0,Math.sin(a)*yy,Math.cos(a)*zz);
          vertexPositionData.push(-0.5*s+offs[0],Math.sin(a)*r*yy+offs[1],Math.cos(a)*r*zz+offs[2]); normalData.push(0.0,Math.sin(a)*yy,Math.cos(a)*zz);
        }
      }
      for(var i=0;i<lod;i++){
        indexData.push(k+i*2+1,k+i*2+0,k+(i+1)*2+0);
        indexData.push(k+i*2+1,k+(i+1)*2+1,k+(i+1)*2+0);
      }
    }

    //SPHERICAL PARTS->
    for(var xx=-1;xx<=1;xx+=2) for(var yy=-1;yy<=1;yy+=2) for(var zz=-1;zz<=1;zz+=2) {
      //Vertices
      var offs = [-0.5*s*xx,0.5*s*yy,0.5*s*zz];
      var nvv=vertexPositionData.length/3;

      for(var j=0;j<=lod;j++){
        var b=j*0.5*Math.PI/lod;
        for(var i=0;i<=lod;i++) {
          var a=i*0.5*Math.PI/lod;
          vertexPositionData.push(r*Math.sin(-a) * Math.sin(b)*xx +offs[0], r*Math.cos(a) * Math.sin(b)*yy+offs[1], r*Math.cos(b)*zz+offs[2]);
          normalData.push(Math.sin(-a) * Math.sin(b)*xx, Math.cos(a) * Math.sin(b)*yy, Math.cos(b)*zz);
        }
      }

      //Indices
      var y=nvv;
      var x=nvv+lod+1;
      for(var j=0;j<lod;j++){
        for(var i=0;i<lod;i++) {
          indexData.push(y,x,x+1);
          indexData.push(y,x+1,y+1);
          y++;
          x++;
        }
        y++;
        x++;
      }
    }

    return new vshape(name,vertexPositionData,normalData,indexData);
  }

  function initRCylinder(name) {
    var tmp = name.match(/\((.*)\)/)[1];
    var a=tmp.split(',');
    var s=0.5;
    var t=1.0;
    if(a.length >=2){
      var t1 = parseFloat(a[0]); //rounded 
      var t2 = parseFloat(a[1]); //thickness
      if(t1) s = t1;
      if(t2) t = t2;
    }

    if(s<0) s=0.0;
    if(s>1) s=1.0;
    if(s==1) { //in case of perfect cubes
      for(var i=0;i<shapes.length;i++) if(shapes[i].name=='cylinder') 
        shapes.push(new vshape(name,shapes[i].positions,shapes[i].normals,shapes[i].indices))
    }
    if(s==0) { //in case of perfect spheres
      for(var i=0;i<shapes.length;i++) if(shapes[i].name=='sphere')
        shapes.push(new vshape(name,shapes[i].positions,shapes[i].normals,shapes[i].indices))
    }

    var llod = lod*4;
    var radius = 0.5;
    var r2=radius-s*t*0.5
    var rr=radius-r2;
    var height = t;
    var h2 = t-rr*2.0;

    var vertexPositionData = [];
    var normalData = [];
    var indexData = [];

    //Top
    vertexPositionData.push(0.0,0.0,height*0.5);
    normalData.push(0.0,0.0,1.0);

    for(var i=0;i<llod;i++){
      var a=2.0*Math.PI*i/llod;
      vertexPositionData.push(Math.sin(a)*r2,Math.cos(a)*r2,height*0.5);
      normalData.push(0.0,0.0,1.0);
    }
    for(var i=0;i<llod;i++){
      indexData.push(1+(i+1)%(llod),1+i,0);
    }
    
    //bottom
    k=vertexPositionData.length/3;
    vertexPositionData.push(0.0,0.0, -height*0.5);
    normalData.push(0.0,0.0,-1.0);

    for(var i=0;i<llod;i++){
      var a=2.0*Math.PI*i/llod;
      vertexPositionData.push(Math.sin(a)*r2, Math.cos(a)*r2,-height*0.5);
      normalData.push(0.0,0.0,-1.0);
    }
    for(var i=0;i<llod;i++){
      indexData.push(k,1+k+i,1+k+(i+1)%(llod));
    }

    //rounded part
    var k=vertexPositionData.length/3;
    for(var j=0;j<=lod;j++){
      var b=j*0.5*Math.PI/lod;
      for(var i=0;i<lod*4;i++) {
        var a=i*0.5*Math.PI/lod;
        var r=r2+rr*Math.sin(b);
        vertexPositionData.push(Math.sin(-a)*r,Math.cos(a)*r,Math.cos(b)*rr + h2*0.5);
        normalData.push(Math.sin(-a)*Math.sin(b),Math.cos(a)*Math.sin(b),Math.cos(b));
      }
    }
    for(var j=0;j<=lod;j++){
      var b=j*0.5*Math.PI/lod + 0.5*Math.PI;
      for(var i=0;i<lod*4;i++) {
        var a=i*0.5*Math.PI/lod;
        var r=r2+rr*Math.sin(b);
        vertexPositionData.push(Math.sin(-a)*r,Math.cos(a)*r,Math.cos(b)*rr - h2*0.5);
        normalData.push(Math.sin(-a)*Math.sin(b),Math.cos(a)*Math.sin(b),Math.cos(b));
      }
    }
    //Indices
    var y=0;
    var x=lod*4;
    for(var j=1;j<=lod*2+1;j++){
      var f=y;
      y=f;
      for(var i=0;i<lod*4-1;i++) {
        indexData.push(k+y,k+x,  k+x+1);
        indexData.push(k+y,k+x+1,k+y+1);
        y++;
        x++;
      }
      indexData.push(k+y,k+x,k+y+1);
      indexData.push(k+y,k+f,k+y+1);
      x++;
      y++;
    }

    return new vshape(name,vertexPositionData,normalData,indexData);
  }

  function initArrow3D(name) {
    var tmp = name.match(/\((.*)\)/)[1];
    var length = parseFloat(tmp);
    if(length == NaN) length = 2.0;
    var bl=length-1.5;
    var radius = 0.5;
    if(bl<1.5) {
      bl=length*0.5;
      radius*=bl/1.5;
    }  

    var llod = lod*4;
    var vertexPositionData = [];
    var normalData = [];
    var indexData = [];

    //Top
    var k=vertexPositionData.length/3;
    var l=Math.sqrt((length-bl)*(length-bl)+radius*radius*4);
    var zf=Math.sqrt(l*l-(length-bl)*(length-bl));
    var xyf=Math.sqrt(l*l-zf*zf);
    for(var i=0;i<llod;i++){
      var a=2.0*Math.PI*i/llod;
      vertexPositionData.push(0.0,0.0, length);
      normalData.push(Math.sin(a)*xyf, Math.cos(a)*xyf, 1.0*zf);
      vertexPositionData.push(Math.sin(a)*radius*2.0, Math.cos(a)*radius*2.0, bl);
      normalData.push(Math.sin(a)*xyf, Math.cos(a)*xyf, 1.0*zf);
    }
    for(var i=0;i<llod;i++){
      indexData.push(k+((i+1)%llod)*2+0, k+i*2+1, k+i*2+0);
      indexData.push(k+i*2+1, k+((i+1)%llod)*2+0, k+((i+1)%llod)*2+1);
    }

    //bottom head
    k=vertexPositionData.length/3;
    vertexPositionData.push(0.0,0.0, bl);
    normalData.push(0.0,0.0,-1.0);

    for(var i=0;i<llod;i++){
      var a=2.0*Math.PI*i/llod;
      vertexPositionData.push(Math.sin(a)*radius*2, Math.cos(a)*radius*2,bl);
      normalData.push(0.0,0.0,-1.0);
    }
    for(var i=0;i<llod;i++){
      indexData.push(k,1+k+i,1+k+(i+1)%(llod));
    }
    
    //Middle
    var k=vertexPositionData.length/3;
    for(var i=0;i<llod;i++){
      var a=2.0*Math.PI*i/llod;
      vertexPositionData.push(Math.sin(a)*radius, Math.cos(a)*radius, bl);
      normalData.push(Math.sin(a), Math.cos(a), 0.0);
      vertexPositionData.push(Math.sin(a)*radius, Math.cos(a)*radius,0.0);
      normalData.push(Math.sin(a), Math.cos(a), 0.0);
    }
    for(var i=0;i<llod;i++){
      indexData.push(k+((i+1)%llod)*2+0, k+i*2+1, k+i*2+0);
      indexData.push(k+i*2+1, k+((i+1)%llod)*2+0, k+((i+1)%llod)*2+1);
    }

    //bottom
    k=vertexPositionData.length/3;
    vertexPositionData.push(0.0,0.0,0.0);
    normalData.push(0.0,0.0,-1.0);

    for(var i=0;i<llod;i++){
      var a=2.0*Math.PI*i/llod;
      vertexPositionData.push(Math.sin(a)*radius, Math.cos(a)*radius,0.0);
      normalData.push(0.0,0.0,-1.0);
    }
    for(var i=0;i<llod;i++){
      indexData.push(k,1+k+i,1+k+(i+1)%(llod));
    }

    return new vshape(name,vertexPositionData,normalData,indexData);
  }


  function initCylinder() {
    var llod = lod*4;
    var radius = 0.5;

    var vertexPositionData = [];
    var normalData = [];
    var indexData = [];

    //Top
    vertexPositionData.push(0.0,0.0,radius);
    normalData.push(0.0,0.0,1.0);

    for(var i=0;i<llod;i++){
      var a=2.0*Math.PI*i/llod;
      vertexPositionData.push(Math.sin(a)*radius,Math.cos(a)*radius,radius);
      normalData.push(0.0,0.0,1.0);
    }
    for(var i=0;i<llod;i++){
      indexData.push(1+(i+1)%(llod),1+i,0);
    }
    
    //Middle
    var k=vertexPositionData.length/3;
    for(var i=0;i<llod;i++){
      var a=2.0*Math.PI*i/llod;
      vertexPositionData.push(Math.sin(a)*radius, Math.cos(a)*radius, radius);
      normalData.push(Math.sin(a), Math.cos(a), 0.0);
      vertexPositionData.push(Math.sin(a)*radius, Math.cos(a)*radius,-radius);
      normalData.push(Math.sin(a), Math.cos(a), 0.0);
    }
    for(var i=0;i<llod;i++){
      indexData.push(k+((i+1)%llod)*2+0, k+i*2+1, k+i*2+0);
      indexData.push(k+i*2+1, k+((i+1)%llod)*2+0, k+((i+1)%llod)*2+1);
    }

    //bottom
    k=vertexPositionData.length/3;
    vertexPositionData.push(0.0,0.0, -radius);
    normalData.push(0.0,0.0,-1.0);

    for(var i=0;i<llod;i++){
      var a=2.0*Math.PI*i/llod;
      vertexPositionData.push(Math.sin(a)*radius, Math.cos(a)*radius,-radius);
      normalData.push(0.0,0.0,-1.0);
    }
    for(var i=0;i<llod;i++){
      indexData.push(k,1+k+i,1+k+(i+1)%(llod));
    }

    return new vshape('cylinder',vertexPositionData,normalData,indexData);
  }

  function initSpheroCylinder(name) {
    var tmp = name.match(/\((.*)\)/)[1];
    var length = parseFloat(tmp);
    if(length<0 || length>1000) length=1.0;

    var radius = 0.5;

    var vertexPositionData = [];
    var normalData = [];
    var indexData = [];

    //Vertices top
    var y=0;
    for(var j=0;j<=lod;j++){
      var b=j*0.5*Math.PI/lod;
      var f=y;
      for(var i=0;i<lod*4;i++) {
        var a=i*0.5*Math.PI/lod;
        vertexPositionData.push(Math.sin(-a)*Math.sin(b)*radius);
        vertexPositionData.push(Math.cos(a)*Math.sin(b)*radius);
        vertexPositionData.push(Math.cos(b)*radius + length*0.5);
        normalData.push(Math.sin(-a)*Math.sin(b));
        normalData.push(Math.cos(a)*Math.sin(b));
        normalData.push(Math.cos(b));
      }
      y=f;
    }

    //Vertices bottom
    for(var j=lod;j<=lod*2;j++){
      var b=j*0.5*Math.PI/lod;
      var f=y;
      for(var i=0;i<lod*4;i++) {
        var a=i*0.5*Math.PI/lod;
        vertexPositionData.push(Math.sin(-a)*Math.sin(b)*radius);
        vertexPositionData.push(Math.cos(a)*Math.sin(b)*radius);
        vertexPositionData.push(Math.cos(b)*radius - length*0.5);
        normalData.push(Math.sin(-a)*Math.sin(b),
                        Math.cos(a)*Math.sin(b),
                        Math.cos(b));
      }
      y=f;
    }

    //Indices
    y=0;
    var x=lod*4;
    for(var j=1;j<=lod*2+1;j++){
      f=y;
      y=f;
      for(var i=0;i<lod*4-1;i++) {
        indexData.push(y,x,x+1);
        indexData.push(y,x+1,y+1);
        y++;
        x++;
      }
      indexData.push(y,x,y+1);
      indexData.push(y,f,y+1);
      x++;
      y++;
    }

    return new vshape(name,vertexPositionData,normalData,indexData);
  }


  function initSphere() {
    var latitudeBands = lod*2;
    var longitudeBands = lod*4;
    var radius = 0.5;

    var vertexPositionData = [];
    var normalData = [];
    for (var latNumber=0; latNumber <= latitudeBands; latNumber++) {
      var theta = latNumber * Math.PI / latitudeBands;
      var sinTheta = Math.sin(theta);
      var cosTheta = Math.cos(theta);

      for (var longNumber=0; longNumber <= longitudeBands; longNumber++) {
        var phi = longNumber * 2 * Math.PI / longitudeBands;
        var sinPhi = Math.sin(phi);
        var cosPhi = Math.cos(phi);

        var x = cosPhi * sinTheta;
        var y = cosTheta;
        var z = sinPhi * sinTheta;

        normalData.push(x);
        normalData.push(y);
        normalData.push(z);
        vertexPositionData.push(radius * x);
        vertexPositionData.push(radius * y);
        vertexPositionData.push(radius * z);
      }
    }

    var indexData = [];
    for (var latNumber=0; latNumber < latitudeBands; latNumber++) {
      for (var longNumber=0; longNumber < longitudeBands; longNumber++) {
        var first = (latNumber * (longitudeBands + 1)) + longNumber;
        var second = first + longitudeBands + 1;
        indexData.push(first);
        indexData.push(second);
        indexData.push(first + 1);

        indexData.push(second);
        indexData.push(second + 1);
        indexData.push(first + 1);
      }
    }

    return new vshape('sphere',vertexPositionData,normalData,indexData);
  }

  function makeShape(name,callWhenFinished){
    if(name.match(/^cylinder/i)){
      var shape = initCylinder();
      callWhenFinished(shape);
    } else if(name.match(/^arrow3d/i)){
      var shape = initArrow3D(name);
      callWhenFinished(shape);
    } else if(name.match(/^arrow/i)){
      var shape = initArrow(name);
      callWhenFinished(shape);
    } else if(name.match(/^sphere/i)){
      var shape = initSphere();
      callWhenFinished(shape);
    } else if(name.match(/^cube/i)){
      var shape = initCube();
      callWhenFinished(shape);
    } else if(name.match(/^rcube/i)){
      var shape = initRCube(name);
      callWhenFinished(shape);
    } else if(name.match(/^rcylinder/i)){
      var shape = initRCylinder(name);
      callWhenFinished(shape);
    } else if(name.match(/^spherocylinder/i)){
      var shape = initSpheroCylinder(name);
      callWhenFinished(shape);
    } else if(name.match(/\.obj$/i)){
      loadFromUrl(name,name,callWhenFinished);
    } else {
      console.error("ERROR Could not make shape: "+name);
    }
  }

  return{ //public functions
    makeShape:makeShape,
  };

}//end of myShapes


////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

var shaderTextVs = 
  "uniform mat4 u_MVMatrix;\n" +
  "uniform mat4 u_PMatrix;\n" +
  "uniform mat3 u_NMatrix;\n" +
  "attribute vec3 a_position;\n" +
  "attribute vec3 a_normal;\n" +
  "attribute vec2 a_texcoord;\n" +
  "varying vec2 v_texCoord;\n " +
  "varying float v_normdot;\n " +
  "void main() {\n" +
  "  v_texCoord = a_texcoord;\n" +
  "  vec3 transformedNormal = normalize(u_NMatrix * a_normal);\n" +
  "  v_normdot = max(dot(transformedNormal, vec3(0.0,0.0,1.0)), 0.0);\n" +
  "  gl_Position = u_PMatrix * u_MVMatrix * vec4(a_position, 1.0);\n" +
  "}\n";

var shaderTextFs = 
  "precision mediump float;\n" +
  "varying vec4 v_position;\n" +
  "varying vec2 v_texCoord;\n" +
  "varying float v_normdot;\n" +
  "uniform sampler2D u_texture;\n" +
  "void main() {\n" +
  "  vec4 diffuseColor = texture2D(u_texture, v_texCoord);\n" +
  "  gl_FragColor = vec4(diffuseColor[0]*v_normdot,diffuseColor[1]*v_normdot,diffuseColor[2]*v_normdot,diffuseColor[3]);\n" +
  "}\n";

var shaderVs = 
  "uniform mat4 u_MVMatrix;\n"+
  "uniform mat4 u_PMatrix;\n"+
  "uniform mat3 u_NMatrix;\n"+
  "uniform vec3 u_Color;\n"+
  "attribute vec3 a_position;\n"+
  "attribute vec3 a_normal;\n"+
  "varying vec3 v_col;\n"+
  "void main() {\n"+
  "  gl_Position = u_PMatrix * u_MVMatrix * vec4(a_position, 1.0);\n"+
  "  vec3 transformedNormal = normalize(u_NMatrix * a_normal);\n"+
  "  float normdot = max(dot(transformedNormal, vec3(0.0,0.0,1.0)), 0.0);\n"+
  "  float hp = normdot*normdot;\n"+
  "  hp=hp*hp*hp*hp;\n"+
  "  hp=hp*hp*hp*hp;\n"+
  "  v_col = vec3(1,1,1)*hp*0.4 + u_Color*(0.2+0.8*normdot);\n"+
  "}\n";

var shaderFs = 
  "precision mediump float;\n" +
  "varying vec3 v_col;\n" +
  "void main() {\n" +
  "  gl_FragColor = vec4(v_col, 1.0);\n" +
  "}\n";

var shaderLinesFs = 
  "precision mediump float;\n"+
  "varying vec4 v_Color;\n"+
  "void main(void) {\n"+
  "    gl_FragColor = v_Color;\n"+
  "}\n";

var shaderLinesVs = 
  "attribute vec3 a_position;\n" +
  "uniform mat4 u_MVMatrix;\n" +
  "uniform mat4 u_PMatrix;\n" +
  "uniform vec3 u_Color;\n" +
  "varying vec4 v_Color;\n" +
  "void main(void) {\n" +
  "    gl_Position = u_PMatrix * u_MVMatrix * vec4(a_position, 1.0);\n" +
  "    v_Color = vec4(u_Color,1.0);\n" +
  "}\n";


////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
