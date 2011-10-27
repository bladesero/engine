pc.extend(pc.resources, function () {
    /**
     * @name pc.resources.ScriptResourceHandler
     * @description ResourceHandler for loading javascript files dynamically
     * Two types of javascript file can be loaded, PlayCanvas ScriptType files which must contain a call to pc.script.create() to be called when the script executes,
     * or regular javascript files, such as third-party libraries.
     * @param {pc.fw.ApplicationContext} context The context is passed into the ScriptType callbacks for use in user-scripts
     * @param {String} prefix Prefix for script urls, so that script resources can be located in a variety of places including localhost
     */
    var ScriptResourceHandler = function (context, prefix) {
        this._context = context;
        
        this._prefix = prefix || ""; // prefix for script urls, allows running from script resources on localhost
        this._queue = []; // queue of urls waiting to load
        this._pending = []; // queue of scripts which have been executed but are waiting to be instanciated
        this._loaded = {}; // Script objects that have loaded 
        this._loading = null; // script element that has been created but is waiting for script to load
                
        pc.script.bind("created", this._onScriptCreated.bind(this));
    };
    ScriptResourceHandler = ScriptResourceHandler.extendsFrom(pc.resources.ResourceHandler);
    
    /**
     * @name pc.resources.ScriptResourceHandler#load
     * @description Load a new javascript resource
     * @param {String} identifier The url of the script file to download
     * @param {Function} success The success callback
     * @param {Function} error The error callback
     * @param {Function} progress The progress callback
     * @param {Object} [options] Optional parameters 
     * @param {Number} [options.timeout] A timeout value in milliseconds before the error callback is fired if the script loading has failed, defaults to 10000
     */
    ScriptResourceHandler.prototype.load = function (identifier, success, error, progress, options) {
        options = options || {};
        options.timeout = options.timeout || 10000; // default 10 second timeout
        
        var url = new pc.URI(identifier);
        url.path = pc.path.join(this._prefix, url.path);
        url = url.toString();
        
        if(this._loaded[url]) {
            if (this._loaded[url] !== true) {
                success(this._loaded[url]);
            } else {
                // regular js script, no need to call success callback
            }
        } else {
            if (this._loading) {
                this._queue.push({
                    url: url.toString(),
                    success: success,
                    error: error,
                    progress: progress
                });
            } else {
                this._addScriptTag(url.toString(), success, error, progress);
            }
        }
        
        if(options.timeout) {
            (function () {
                setTimeout(function () {
                    if (!this._loaded[url]) {
                        error(pc.string.format("Loading script {0} timed out after {1}s", url, options.timeout / 1000));
                    }
                }.bind(this), options.timeout);
            }).call(this);
        }
    };
    
    ScriptResourceHandler.prototype.open = function (data, options) {
        return data;
    };
    
    /**
     * @private
     * @name pc.resources.ScriptResourceHandler#_onScriptCreated
     * @description Event handler received when the pc.script.create() function is called when a ScriptType is downloaded.
     * @param {String} name The name of the script created
     * @param {Function} callback The callback that will return the ScriptType
     */
    ScriptResourceHandler.prototype._onScriptCreated = function (name, callback) {
        this._pending.push({
            name: name,
            callback: callback
        });
    };
    
    /**
     * @private
     * @name pc.resources.ScriptResourceHandler#_addScriptTag
     * @description Add a new script tag to the document.head and set it's src to load a new script.
     * Handle success and errors and load the next in the queue 
     */
    ScriptResourceHandler.prototype._addScriptTag = function (url, success, error, progress) {
        var self = this;
        var head = document.getElementsByTagName("head")[0];
        var element = document.createElement("script");
        this._loading = element;
        
        element.addEventListener("error", function (e) {
            error(pc.string.format("Error loading script from '{0}'", e.target.src));    
        });
        
        element.onload = element.onreadystatechange = function () {
            if(!this.readyState || (this.readyState == "loaded" || this.readyState == "complete")) {
                var script = self._pending.shift();
                if (script) {
                    var ScriptType = script.callback(self._context);
                    if (ScriptType._pcScriptName) {
                        throw Error("Attribute _pcScriptName is reserved on ScriptTypes for ResourceLoader use");
                    }
                    ScriptType._pcScriptName = script.name; // store name in script object
                    self._loaded[url] = ScriptType; //{name: script.name, ScriptType: ScriptType};
                    success(ScriptType);
                } else {
                    // loaded a regular javascript script, so no ScriptType to instanciate.
                    // However, we still need to register that we've loaded it in case there is a timeout
                    self._loaded[url] = true;
                }
                self._loading = null;
                // Load next one in the queue
                if (self._queue.length) {
                   var loadable = self._queue.shift();
                   self._addScriptTag(loadable.url, loadable.success, loadable.error, loadable.progress);
                }                    
            }
        };
        // set the src attribute after the onload callback is set, to avoid an instant loading failing to fire the callback
        element.src = url;

        head.appendChild(element);
    };
    
    var ScriptRequest = function ScriptRequest() {
    };
    ScriptRequest = ScriptRequest.extendsFrom(pc.resources.ResourceRequest);
    ScriptRequest.prototype.type = "script";
    
    return {
        ScriptResourceHandler: ScriptResourceHandler,
        ScriptRequest: ScriptRequest
    };
}());
