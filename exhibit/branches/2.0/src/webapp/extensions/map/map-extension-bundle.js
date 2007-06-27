

/* map-view.js */



Exhibit.MapView=function(containerElmt,uiContext){
this._div=containerElmt;
this._uiContext=uiContext;

this._settings={};
this._accessors={
getProxy:function(itemID,database,visitor){visitor(itemID);},
getColorKey:null,
getIcon:null
};
this._colorCoder=null;

var view=this;
this._listener={
onItemsChanged:function(){
view._reconstruct();
}
};
uiContext.getCollection().addListener(this._listener);
};

Exhibit.MapView._settingSpecs={
"center":{type:"float",defaultValue:[20,0],dimensions:2},
"zoom":{type:"float",defaultValue:2},
"size":{type:"text",defaultValue:"small"},
"scaleControl":{type:"boolean",defaultValue:true},
"overviewControl":{type:"boolean",defaultValue:false},
"type":{type:"enum",defaultValue:"normal",choices:["normal","satellite","hybrid"]},
"bubbleTip":{type:"enum",defaultValue:"top",choices:["top","bottom"]},
"mapHeight":{type:"int",defaultValue:400},
"mapConstructor":{type:"function",defaultValue:null},
"color":{type:"text",defaultValue:"#FF9000"},
"colorCoder":{type:"text",defaultValue:null},
"iconScale":{type:"float",defaultValue:1},
"iconOffsetX":{type:"float",defaultValue:0},
"iconOffsetY":{type:"float",defaultValue:0},
"shape":{type:"text",defaultValue:"circle"},
"bodyWidth":{type:"int",defaultValue:24},
"bodyHeight":{type:"int",defaultValue:24},
"pin":{type:"boolean",defaultValue:true},
"pinHeight":{type:"int",defaultValue:6},
"pinWidth":{type:"int",defaultValue:6}
};

Exhibit.MapView._accessorSpecs=[
{accessorName:"getProxy",
attributeName:"proxy"
},
{accessorName:"getLatlng",
alternatives:[
{bindings:[
{attributeName:"latlng",
types:["float","float"],
bindingNames:["lat","lng"]
},
{attributeName:"maxAutoZoom",
type:"float",
bindingName:"maxAutoZoom",
optional:true
}
]
},
{bindings:[
{attributeName:"lat",
type:"float",
bindingName:"lat"
},
{attributeName:"lng",
type:"float",
bindingName:"lng"
},
{attributeName:"maxAutoZoom",
type:"float",
bindingName:"maxAutoZoom",
optional:true
}
]
}
]
},
{accessorName:"getColorKey",
attributeName:"marker",
type:"text"
},
{accessorName:"getColorKey",
attributeName:"colorKey",
type:"text"
},
{accessorName:"getIcon",
attributeName:"icon",
type:"url"
}
];

Exhibit.MapView.create=function(configuration,containerElmt,uiContext){
var view=new Exhibit.MapView(
containerElmt,
Exhibit.UIContext.create(configuration,uiContext)
);
Exhibit.MapView._configure(view,configuration);

view._internalValidate();
view._initializeUI();
return view;
};

Exhibit.MapView.createFromDOM=function(configElmt,containerElmt,uiContext){
var configuration=Exhibit.getConfigurationFromDOM(configElmt);
var view=new Exhibit.MapView(
containerElmt!=null?containerElmt:configElmt,
Exhibit.UIContext.createFromDOM(configElmt,uiContext)
);

Exhibit.SettingsUtilities.createAccessorsFromDOM(configElmt,Exhibit.MapView._accessorSpecs,view._accessors);
Exhibit.SettingsUtilities.collectSettingsFromDOM(configElmt,Exhibit.MapView._settingSpecs,view._settings);
Exhibit.MapView._configure(view,configuration);

view._internalValidate();
view._initializeUI();
return view;
};

Exhibit.MapView._configure=function(view,configuration){
Exhibit.SettingsUtilities.createAccessors(configuration,Exhibit.MapView._accessorSpecs,view._accessors);
Exhibit.SettingsUtilities.collectSettings(configuration,Exhibit.MapView._settingSpecs,view._settings);

var accessors=view._accessors;
view._getLatlng=function(itemID,database,visitor){
accessors.getProxy(itemID,database,function(proxy){
accessors.getLatlng(proxy,database,visitor);
});
};
};

Exhibit.MapView.lookupLatLng=function(set,addressExpressionString,outputProperty,outputTextArea,database,accuracy){
if(accuracy==undefined){
accuracy=4;
}

var expression=Exhibit.ExpressionParser.parse(addressExpressionString);
var jobs=[];
set.visit(function(item){
var address=expression.evaluateSingle(
{"value":item},
{"value":"item"},
"value",
database
).value
if(address!=null){
jobs.push({item:item,address:address});
}
});

var results=[];
var geocoder=new GClientGeocoder();
var cont=function(){
if(jobs.length>0){
var job=jobs.shift();
geocoder.getLocations(
job.address,
function(json){
if("Placemark"in json){
json.Placemark.sort(function(p1,p2){
return p2.AddressDetails.Accuracy-p1.AddressDetails.Accuracy;
});
}

if("Placemark"in json&&
json.Placemark.length>0&&
json.Placemark[0].AddressDetails.Accuracy>=accuracy){

var coords=json.Placemark[0].Point.coordinates;
var lat=coords[1];
var lng=coords[0];
results.push("\t{ id: '"+job.item+"', "+outputProperty+": '"+lat+","+lng+"' }");
}else{
var segments=job.address.split(",");
if(segments.length==1){
results.push("\t{ id: '"+job.item+"' }");
}else{
job.address=segments.slice(1).join(",").replace(/^\s+/,"");
jobs.unshift(job);
}
}
cont();
}
);
}else{
outputTextArea.value=results.join(",\n");
}
};
cont();
};

Exhibit.MapView.prototype.dispose=function(){
this._uiContext.getCollection().removeListener(this._listener);

this._map=null;

this._toolboxWidget.dispose();
this._toolboxWidget=null;

this._dom.dispose();
this._dom=null;

this._uiContext.dispose();
this._uiContext=null;

this._div.innerHTML="";
this._div=null;

GUnload();
};

Exhibit.MapView.prototype._internalValidate=function(){
if("getColorKey"in this._accessors){
if("colorCoder"in this._settings){
this._colorCoder=this._uiContext.getExhibit().getComponent(this._settings.colorCoder);
}

if(this._colorCoder==null){
this._colorCoder=new Exhibit.DefaultColorCoder(this._uiContext);
}
}
};

Exhibit.MapView.prototype._initializeUI=function(){
var self=this;
var settings=this._settings;

this._div.innerHTML="";
this._dom=Exhibit.ViewUtilities.constructPlottingViewDom(
this._div,
this._uiContext,
true,
{onResize:function(){
self._map.checkResize();
}
},
{markerGenerator:function(color){
var shape="square";
return SimileAjax.Graphics.createTranslucentImage(
Exhibit.MapView._markerUrlPrefix+
"?renderer=map-marker&shape="+Exhibit.MapView._defaultMarkerShape+
"&width=20&height=20&pinHeight=5&background="+color.substr(1),
"middle"
);
}
}
);
this._toolboxWidget=Exhibit.ToolboxWidget.createFromDOM(this._div,this._div,this._uiContext);

var mapDiv=this._dom.plotContainer;
mapDiv.style.height=settings.mapHeight+"px";
mapDiv.className="exhibit-mapView-map";

var settings=this._settings;
if(settings._mapConstructor!=null){
this._map=settings._mapConstructor(mapDiv);
}else{
this._map=new GMap2(mapDiv);
this._map.enableDoubleClickZoom();
this._map.enableContinuousZoom();

this._map.setCenter(new GLatLng(settings.center[0],settings.center[1]),settings.zoom);

this._map.addControl(settings.size=="small"?new GSmallMapControl():new GLargeMapControl());
if(settings.overviewControl){
this._map.addControl(new GOverviewMapControl);
}
if(settings.scaleControl){
this._map.addControl(new GScaleControl());
}

this._map.addControl(new GMapTypeControl());
switch(settings.type){
case"normal":
this._map.setMapType(G_NORMAL_MAP);
break;
case"satellite":
this._map.setMapType(G_SATELLITE_MAP);
break;
case"hybrid":
this._map.setMapType(G_HYBRID_MAP);
break;
}
}
this._reconstruct();
};

Exhibit.MapView.prototype._reconstruct=function(){
var self=this;
var collection=this._uiContext.getCollection();
var database=this._uiContext.getDatabase();
var settings=this._settings;
var accessors=this._accessors;


var originalSize=collection.countAllItems();
var currentSize=collection.countRestrictedItems();
var unplottableItems=[];

this._map.clearOverlays();
this._dom.legendWidget.clear();
if(currentSize>0){
var currentSet=collection.getRestrictedItems();
var locationToData={};
var hasColorKey=(this._accessors.getColorKey!=null);
var hasIcon=(this._accessors.getIcon!=null);

currentSet.visit(function(itemID){
var latlngs=[];
self._getLatlng(itemID,database,function(v){if("lat"in v&&"lng"in v)latlngs.push(v);});

if(latlngs.length>0){
var colorKeys=null;
if(hasColorKey){
colorKeys=new Exhibit.Set();
accessors.getColorKey(itemID,database,function(v){colorKeys.add(v);});
}

for(var n=0;n<latlngs.length;n++){
var latlng=latlngs[n];
var latlngKey=latlng.lat+","+latlng.lng;
if(latlngKey in locationToData){
var locationData=locationToData[latlngKey];
locationData.items.push(itemID);
if(hasColorKey){
locationData.colorKeys.addSet(colorKeys);
}
}else{
var locationData={
latlng:latlng,
items:[itemID]
};
if(hasColorKey){
locationData.colorKeys=colorKeys;
}
locationToData[latlngKey]=locationData;
}
}
}else{
unplottableItems.push(itemID);
}
});

var colorCodingFlags={mixed:false,missing:false,others:false,keys:new Exhibit.Set()};
var bounds,maxAutoZoom=Infinity;
var addMarkerAtLocation=function(locationData){
var itemCount=locationData.items.length;
if(!bounds){
bounds=new GLatLngBounds();
}

var shape=self._settings.shape;

var color=self._settings.color;
if(hasColorKey){
color=self._colorCoder.translateSet(locationData.colorKeys,colorCodingFlags);
}

var icon=null;
if(itemCount==1){
if(hasIcon){
accessors.getIcon(locationData.items[0],database,function(v){icon=v;});
}
}

var icon=Exhibit.MapView._makeIcon(
shape,
color,
itemCount==1?"":itemCount.toString(),
icon,
self._settings
);

var point=new GLatLng(locationData.latlng.lat,locationData.latlng.lng);
var marker=new GMarker(point,icon);
if(maxAutoZoom>locationData.latlng.maxAutoZoom){
maxAutoZoom=locationData.latlng.maxAutoZoom;
}
bounds.extend(point);

GEvent.addListener(marker,"click",function(){
marker.openInfoWindow(self._createInfoWindow(locationData.items));
});
self._map.addOverlay(marker);
}
for(var latlngKey in locationToData){
addMarkerAtLocation(locationToData[latlngKey]);
}

if(hasColorKey){
var legendWidget=this._dom.legendWidget;
var colorCoder=this._colorCoder;
var keys=colorCodingFlags.keys.toArray().sort();
for(var k=0;k<keys.length;k++){
var key=keys[k];
var color=colorCoder.translate(key);
legendWidget.addEntry(color,key);
}

if(colorCodingFlags.others){
legendWidget.addEntry(colorCoder.getOthersColor(),colorCoder.getOthersLabel());
}
if(colorCodingFlags.mixed){
legendWidget.addEntry(colorCoder.getMixedColor(),colorCoder.getMixedLabel());
}
if(colorCodingFlags.missing){
legendWidget.addEntry(colorCoder.getMissingColor(),colorCoder.getMissingLabel());
}
}

if(bounds&&typeof settings.zoom=="undefined"){
var zoom=Math.max(0,self._map.getBoundsZoomLevel(bounds)-1);
zoom=Math.min(zoom,maxAutoZoom,settings.maxAutoZoom);
self._map.setZoom(zoom);
}
if(bounds&&typeof settings.center=="undefined"){
self._map.setCenter(bounds.getCenter());
}
}
this._dom.setUnplottableMessage(currentSize,unplottableItems);
};

Exhibit.MapView.prototype._createInfoWindow=function(items){
return Exhibit.ViewUtilities.fillBubbleWithItems(
null,
items,
this._uiContext
);
};

Exhibit.MapView._iconData=null;
Exhibit.MapView._markerUrlPrefix="http://simile.mit.edu/painter/painter?";
Exhibit.MapView._defaultMarkerShape="circle";

Exhibit.MapView._makeIcon=function(shape,color,label,iconURL,settings){
var extra=label.length*3;
var halfWidth=Math.ceil(settings.bodyWidth/2)+extra;
var bodyHeight=settings.bodyHeight;
var width=halfWidth*2;
var height=bodyHeight;

var icon=new GIcon();
var imageParameters=[
"renderer=map-marker",
"shape="+shape,
"width="+width,
"height="+bodyHeight,
"background="+color.substr(1),
"label="+label
];
var shadowParameters=[
"renderer=map-marker-shadow",
"shape="+shape,
"width="+width,
"height="+bodyHeight
];
var pinParameters=[];

if(iconURL!=null){
imageParameters.push("icon="+iconURL);
if(settings.iconScale!=1){
imageParameters.push("iconScale="+settings.iconScale);
}
if(settings.iconOffsetX!=1){
imageParameters.push("iconX="+settings.iconOffsetX);
}
if(settings.iconOffsetY!=1){
imageParameters.push("iconY="+settings.iconOffsetY);
}
}

if(settings.pin){
var pinHeight=settings.pinHeight;
var pinHalfWidth=Math.ceil(settings.pinWidth/2);

height+=pinHeight;

pinParameters.push("pinHeight="+pinHeight);
pinParameters.push("pinWidth="+(pinHalfWidth*2));

icon.iconAnchor=new GPoint(halfWidth,height);
icon.imageMap=[
0,0,
0,bodyHeight,
halfWidth-pinHalfWidth,bodyHeight,
halfWidth,height,
halfWidth+pinHalfWidth,bodyHeight,
width,bodyHeight,
width,0
];
icon.shadowSize=new GSize(width*1.5,height-2);
icon.infoWindowAnchor=(settings.bubbleTip=="bottom")?new GPoint(halfWidth,height):new GPoint(halfWidth,0);
}else{
pinParameters.push("pin=false");

icon.iconAnchor=new GPoint(halfWidth,Math.ceil(height/2));
icon.imageMap=[
0,0,
0,bodyHeight,
width,bodyHeight,
width,0
];
icon.infoWindowAnchor=new GPoint(halfWidth,0);
}

icon.image=Exhibit.MapView._markerUrlPrefix+imageParameters.concat(pinParameters).join("&");
icon.shadow=Exhibit.MapView._markerUrlPrefix+shadowParameters.concat(pinParameters).join("&");
icon.iconSize=new GSize(width,height);
icon.shadowSize=new GSize(width*1.5,height-2);

return icon;
};


/* vemap-view.js */





Exhibit.VEMapView=function(containerElmt,uiContext){
this._div=containerElmt;
this._uiContext=uiContext;

this._settings={};
this._accessors={
getProxy:function(itemID,database,visitor){visitor(itemID);},
getColorKey:null,
getIcon:null
};
this._colorCoder=null;

var view=this;
this._listener={
onItemsChanged:function(){
view._reconstruct();
}
};
uiContext.getCollection().addListener(this._listener);
};

Exhibit.VEMapView._settingSpecs={
"center":{type:"float",defaultValue:[20,0],dimensions:2},
"zoom":{type:"float",defaultValue:2},
"size":{type:"text",defaultValue:"small"},
"scaleControl":{type:"boolean",defaultValue:true},
"overviewControl":{type:"boolean",defaultValue:false},
"type":{type:"enum",defaultValue:"normal",choices:["normal","satellite","hybrid"]},
"bubbleTip":{type:"enum",defaultValue:"top",choices:["top","bottom"]},
"mapHeight":{type:"int",defaultValue:400},
"mapConstructor":{type:"function",defaultValue:null},
"color":{type:"text",defaultValue:"#FF9000"},
"colorCoder":{type:"text",defaultValue:null},
"iconScale":{type:"float",defaultValue:1},
"iconOffsetX":{type:"float",defaultValue:0},
"iconOffsetY":{type:"float",defaultValue:0},
"shape":{type:"text",defaultValue:"circle"},
"bodyWidth":{type:"int",defaultValue:24},
"bodyHeight":{type:"int",defaultValue:24},
"pin":{type:"boolean",defaultValue:true},
"pinHeight":{type:"int",defaultValue:6},
"pinWidth":{type:"int",defaultValue:6}
};

Exhibit.VEMapView._accessorSpecs=[
{accessorName:"getProxy",
attributeName:"proxy"
},
{accessorName:"getLatlng",
alternatives:[
{bindings:[
{attributeName:"latlng",
types:["float","float"],
bindingNames:["lat","lng"]
},
{attributeName:"maxAutoZoom",
type:"float",
bindingName:"maxAutoZoom",
optional:true
}
]
},
{bindings:[
{attributeName:"lat",
type:"float",
bindingName:"lat"
},
{attributeName:"lng",
type:"float",
bindingName:"lng"
},
{attributeName:"maxAutoZoom",
type:"float",
bindingName:"maxAutoZoom",
optional:true
}
]
}
]
},
{accessorName:"getColorKey",
attributeName:"marker",
type:"text"
},
{accessorName:"getColorKey",
attributeName:"colorKey",
type:"text"
},
{accessorName:"getIcon",
attributeName:"icon",
type:"url"
}
];

Exhibit.VEMapView.create=function(configuration,containerElmt,uiContext){
var view=new Exhibit.VEMapView(
containerElmt,
Exhibit.UIContext.create(configuration,uiContext)
);
Exhibit.VEMapView._configure(view,configuration);

view._internalValidate();
view._initializeUI();
return view;
};

Exhibit.VEMapView.createFromDOM=function(configElmt,containerElmt,uiContext){
var configuration=Exhibit.getConfigurationFromDOM(configElmt);
var view=new Exhibit.VEMapView(
containerElmt!=null?containerElmt:configElmt,
Exhibit.UIContext.createFromDOM(configElmt,uiContext)
);

Exhibit.SettingsUtilities.createAccessorsFromDOM(configElmt,Exhibit.VEMapView._accessorSpecs,view._accessors);
Exhibit.SettingsUtilities.collectSettingsFromDOM(configElmt,Exhibit.VEMapView._settingSpecs,view._settings);
Exhibit.VEMapView._configure(view,configuration);

view._internalValidate();
view._initializeUI();
return view;
};

Exhibit.VEMapView._configure=function(view,configuration){
Exhibit.SettingsUtilities.createAccessors(configuration,Exhibit.VEMapView._accessorSpecs,view._accessors);
Exhibit.SettingsUtilities.collectSettings(configuration,Exhibit.VEMapView._settingSpecs,view._settings);

var accessors=view._accessors;
view._getLatlng=function(itemID,database,visitor){
accessors.getProxy(itemID,database,function(proxy){
accessors.getLatlng(proxy,database,visitor);
});
};
};

Exhibit.VEMapView.prototype.dispose=function(){
this._uiContext.getCollection().removeListener(this._listener);

this._map=null;

this._toolboxWidget.dispose();
this._toolboxWidget=null;

this._dom.dispose();
this._dom=null;

this._uiContext.dispose();
this._uiContext=null;

this._div.innerHTML="";
this._div=null;


};

Exhibit.VEMapView.prototype._internalValidate=function(){
if("getColorKey"in this._accessors){
if("colorCoder"in this._settings){
this._colorCoder=this._uiContext.getExhibit().getComponent(this._settings.colorCoder);
}

if(this._colorCoder==null){
this._colorCoder=new Exhibit.DefaultColorCoder(this._uiContext);
}
}
};

Exhibit.VEMapView.prototype._initializeUI=function(){
var self=this;
var settings=this._settings;

this._div.innerHTML="";
this._dom=Exhibit.ViewUtilities.constructPlottingViewDom(
this._div,
this._uiContext,
true,
{},
{markerGenerator:function(color){
var shape="square";
return SimileAjax.Graphics.createTranslucentImage(
Exhibit.VEMapView._markerUrlPrefix+
"?renderer=map-marker&shape="+Exhibit.VEMapView._defaultMarkerShape+
"&width=20&height=20&pinHeight=5&background="+color.substr(1),
"middle"
);
}
}
);
this._toolboxWidget=Exhibit.ToolboxWidget.createFromDOM(this._div,this._div,this._uiContext);

var mapDiv=this._dom.plotContainer;
mapDiv.style.height=settings.mapHeight+"px";
mapDiv.className="exhibit-mapView-map";
mapDiv.style.position="relative";
mapDiv.int=1
mapDiv.id="map-"+mapDiv.int++;

var settings=this._settings;
if(settings._mapConstructor!=null){
this._map=settings._mapConstructor(mapDiv);
}
else{
this._map=new VEMap(mapDiv.id);
this._map.LoadMap(new VELatLong(settings.center[0],settings.center[1]),settings.zoom);
}
this._reconstruct();
};

Exhibit.VEMapView.prototype._reconstruct=function(){
var self=this;
var collection=this._uiContext.getCollection();
var database=this._uiContext.getDatabase();
var settings=this._settings;
var accessors=this._accessors;
var originalSize=collection.countAllItems();
var currentSize=collection.countRestrictedItems();
var unplottableItems=[];

this._map.DeleteAllShapeLayers();
this._dom.legendWidget.clear();

if(currentSize>0){
var currentSet=collection.getRestrictedItems();
var locationToData={};
var hasColorKey=(this._accessors.getColorKey!=null);
var hasIcon=(this._accessors.getIcon!=null);

currentSet.visit(function(itemID){
var latlngs=[];
self._getLatlng(itemID,database,function(v){
if("lat"in v&&"lng"in v)latlngs.push(v);
}
);

if(latlngs.length>0){
var colorKeys=null;
if(hasColorKey){
colorKeys=new Exhibit.Set();
accessors.getColorKey(itemID,database,function(v){colorKeys.add(v);});
}


for(var n=0;n<latlngs.length;n++){
var latlng=latlngs[n];
var latlngKey=latlng.lat+","+latlng.lng;
if(latlngKey in locationToData){
var locationData=locationToData[latlngKey];
locationData.items.push(itemID);
if(hasColorKey){
locationData.colorKeys.addSet(colorKeys);
}
}else{
var locationData={
latlng:latlng,
items:[itemID]
};
if(hasColorKey){
locationData.colorKeys=colorKeys;
}
locationToData[latlngKey]=locationData;
}
}
}else{
unplottableItems.push(itemID);
}
});

var colorCodingFlags={mixed:false,missing:false,others:false,keys:new Exhibit.Set()};
var bounds,maxAutoZoom=Infinity;
var addMarkerAtLocation=function(locationData){
var itemCount=locationData.items.length;
var shape=self._settings.shape;
var color=self._settings.color;
if(hasColorKey){
color=self._colorCoder.translateSet(locationData.colorKeys,colorCodingFlags);
}

var icon=null;
if(itemCount==1){
if(hasIcon){
accessors.getIcon(locationData.items[0],database,function(v){icon=v;});
}
}

var icon=Exhibit.VEMapView._makeIcon(
shape,
color,
itemCount==1?"":itemCount.toString(),
icon,
self._settings
);

var layer=new VEShapeLayer();
var point=new VELatLong(locationData.latlng.lat,locationData.latlng.lng);
var marker=new VEShape(VEShapeType.Pushpin,point);
var title=locationData.items[0];
var description=self._createDescription(locationData.items);

marker.SetCustomIcon(icon);
marker.SetTitle(title);
marker.SetDescription(description);
marker.SetIconAnchor(point);

self._map.AddShapeLayer(layer);
layer.AddShape(marker);
}
for(var latlngKey in locationToData){
addMarkerAtLocation(locationToData[latlngKey]);
}

if(hasColorKey){
var legendWidget=this._dom.legendWidget;
var colorCoder=this._colorCoder;
var keys=colorCodingFlags.keys.toArray().sort();
for(var k=0;k<keys.length;k++){
var key=keys[k];
var color=colorCoder.translate(key);
legendWidget.addEntry(color,key);
}

if(colorCodingFlags.others){
legendWidget.addEntry(colorCoder.getOthersColor(),colorCoder.getOthersLabel());
}
if(colorCodingFlags.mixed){
legendWidget.addEntry(colorCoder.getMixedColor(),colorCoder.getMixedLabel());
}
if(colorCodingFlags.missing){
legendWidget.addEntry(colorCoder.getMissingColor(),colorCoder.getMissingLabel());
}
}
}
this._dom.setUnplottableMessage(currentSize,unplottableItems);
};


Exhibit.VEMapView.prototype._createDescription=function(items){
var bubbleElmt=Exhibit.ViewUtilities.fillBubbleWithItems(
null,
items,
this._uiContext
);
var newElmt=document.createElement("div");
newElmt.appendChild(bubbleElmt);

console.log(newElmt.innerHTML);
return newElmt.innerHTML;
};

Exhibit.VEMapView._iconData=null;
Exhibit.VEMapView._markerUrlPrefix="http://simile.mit.edu/painter/painter?";
Exhibit.VEMapView._defaultMarkerShape="circle";


Exhibit.VEMapView._makeIcon=function(shape,color,label,iconURL,settings){
var extra=label.length*3;
var halfWidth=Math.ceil(settings.bodyWidth/2)+extra;
var bodyHeight=settings.bodyHeight;
var width=halfWidth*2;
var height=bodyHeight;

var icon=new VECustomIconSpecification

var imageParameters=[
"renderer=map-marker",
"shape="+shape,
"width="+width,
"height="+bodyHeight,
"background="+color.substr(1),
"label="+label
];

var pinParameters=[];

if(iconURL!=null){
imageParameters.push("icon="+iconURL);
if(settings.iconScale!=1){
imageParameters.push("iconScale="+settings.iconScale);
}
if(settings.iconOffsetX!=1){
imageParameters.push("iconX="+settings.iconOffsetX);
}
if(settings.iconOffsetY!=1){
imageParameters.push("iconY="+settings.iconOffsetY);
}
}


if(settings.pin){
var pinHeight=settings.pinHeight;
var pinHalfWidth=Math.ceil(settings.pinWidth/4);

height+=pinHeight;

pinParameters.push("pinHeight="+pinHeight);
pinParameters.push("pinWidth="+(pinHalfWidth*2));



console.log(icon.ImageOffset);
}else{
pinParameters.push("pin=false");
}

icon.TextContent=" "
icon.Image=Exhibit.MapView._markerUrlPrefix+imageParameters.concat(pinParameters).join("&");
icon.ImageHeight=height;
icon.ImageWidth=width;



return icon

};