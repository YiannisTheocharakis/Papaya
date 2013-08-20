
/**
 * @classDescription	The Volume class represents a 3-D image volume dataset.  It contains namely a header and imageData objects.
 */
var papaya = papaya || {};
papaya.volume = papaya.volume || {};


/**
 * Constructor.
 */
papaya.volume.Volume = papaya.volume.Volume || function() {
	// Public properties
	this.file = null;
    this.url = null;
	this.fileName = null;
	this.compressed = false;
	this.headerType = papaya.volume.Volume.TYPE_UNKNOWN;
	this.header = new papaya.volume.Header();
	this.imageData = new papaya.volume.ImageData();
	this.rawData = null;
	this.onFinishedRead = null;
	this.errorMessage = null;
	this.swap16 = false;
	this.swap32 = false;
}


// Public constants
papaya.volume.Volume.TYPE_UNKNOWN = 0;
papaya.volume.Volume.TYPE_NIFTI = 1;


// Public methods

/**
 * Find the type of header file.
 * @param {String} filename
 * @return {Numberic}	the header type code
 */
papaya.volume.Volume.prototype.findFileType = function(filename) {
	if (filename.indexOf(".nii") != -1) {
		return papaya.volume.Volume.TYPE_NIFTI;
	} else {
		return papaya.volume.Volume.TYPE_UNKNOWN;
	}
}


/**
 * Determine if the file is compressed.
 * @param {String} filename
 * @return {Boolean}	true if the file is compressed, false otherwise
 */
papaya.volume.Volume.prototype.fileIsCompressed = function(filename) {
	return (filename.indexOf(".gz") != -1);
}


/**
 * Read image file.
 * @param {File} file	The file to read.
 * @param {Function} callback	The function to call after reading is complete.
 */
papaya.volume.Volume.prototype.readFile = function(file, callback) {
	this.file = file;
	this.fileName = new String(file.name);
	this.onFinishedRead = callback;

	this.headerType = this.findFileType(this.fileName);
	this.compressed = this.fileIsCompressed(this.fileName);

	fileLength = this.file.size;

    var blob = makeSlice(this.file, 0, this.file.size);
	this.readData(this, blob);
}




papaya.volume.Volume.prototype.readURL = function(url, callback) {
    try {
        this.url = url;
        this.fileName = url.substr(url.lastIndexOf("/")+1, url.length);
        this.onFinishedRead = callback;

        this.headerType = this.findFileType(this.fileName);
        this.compressed = this.fileIsCompressed(this.fileName);

        var vol = this;
        var xhr = new XMLHttpRequest();

        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';

        xhr.onreadystatechange = function() {
            if ((xhr.readyState == 4) && (xhr.status == 200)) {
                vol.rawData = xhr.response;
                fileLength = vol.rawData.byteLength;
                vol.decompress(vol);
            } else {
                vol.errorMessage = "There was a problem reading that file:\n\n" + xhr.responseText;
                vol.finishedLoad();
            }
        };
        xhr.send(null);
    } catch (err) {
        vol.errorMessage = "There was a problem reading that file:\n\n" + err.message;
        vol.finishedLoad();
    }
}




/**
 * Return a voxel value at a specified coordinate index.
 * @param {Numeric} ctrX	The X location.
 * @param {Numeric} ctrY	The Y location.
 * @param {Numeric} ctrZ	The Z location.
 * @return {Numeric}	The value at that coordinate index.
 */
papaya.volume.Volume.prototype.getVoxelAtIndex = function(ctrX, ctrY, ctrZ) {
	var val = this.imageData.data[this.header.orientation.convertIndexToOffset(ctrX, ctrY, ctrZ)];
	
	if (this.swap16) {
		return ((val & 0xFF) << 8) | ((val >> 8) & 0xFF);
	} else if (this.swap32) {
		return ((val & 0xFF) << 24) | ((val & 0xFF00) << 8) | ((val >> 8) & 0xFF00) | ((val >> 24) & 0xFF);
	} else {
		return val;
	}      
}


/**
 * Test whether this object is in this.errorMessage state.
 * @param {Boolean}	True if this object is in this.errorMessage state.
 */
papaya.volume.Volume.prototype.hasError = function() {
	return (this.errorMessage != null);
}


/**
 * Returns the X dimension.
 * @return {Numeric}	the X dim
 */
papaya.volume.Volume.prototype.getXDim = function() {
	return this.header.imageDimensions.xDim;
}


/**
 * Returns the Y dimension.
 * @return {Numeric}	the Y dim
 */
papaya.volume.Volume.prototype.getYDim = function() {
	return this.header.imageDimensions.yDim;
}


/**
 * Returns the Z dimension.
 * @return {Numeric}	the Z dim
 */
papaya.volume.Volume.prototype.getZDim = function() {
	return this.header.imageDimensions.zDim;
}


/**
 * Returns the size of the voxel is X.
 * @return {Numeric}	the size of the voxel is X
 */
papaya.volume.Volume.prototype.getXSize = function() {
	return this.header.voxelDimensions.xSize;
}


/**
 * Returns the size of the voxel is Y.
 * @return {Numeric}	the size of the voxel is Y
 */
papaya.volume.Volume.prototype.getYSize = function() {
	return this.header.voxelDimensions.ySize;
}


/**
 * Returns the size of the voxel is Z.
 * @return {Numeric}	the size of the voxel is Z
 */
papaya.volume.Volume.prototype.getZSize = function() {
	return this.header.voxelDimensions.zSize;
}


/**
 * Read file data into volume.
 * @param {Volume} vol	the volume
 */
papaya.volume.Volume.prototype.readData = function(vol, blob) {
    try {
        var reader = new FileReader();

	    reader.onloadend = bind(vol, function(evt) {
		    if (evt.target.readyState == FileReader.DONE) {
		    	vol.rawData = evt.target.result;
		    	setTimeout(function(){vol.decompress(vol)}, 0);
		    }
	    });

        reader.onerror = bind(vol, function(evt) {
            vol.errorMessage = "There was a problem reading that file:\n\n" + evt.getMessage();
            vol.finishedLoad();
        });

        reader.readAsArrayBuffer(blob);
   } catch (err) {
        vol.errorMessage = "There was a problem reading that file:\n\n" + err.message;
        vol.finishedLoad();
   }
}


/**
 * Check if the data is compressed and decompress if so.
 * @param {Volume} vol	the volume
 */
papaya.volume.Volume.prototype.decompress = function(vol) {
	if (vol.compressed) {
		var gunzip = new papaya.utils.Gunzip();
		gunzip.gunzip(vol.rawData, function(data){vol.finishedDecompress(vol, data)});

		if (gunzip.hasError()) {
			vol.errorMessage = gunzip.getError();
			vol.finishedLoad();
		}
	} else {
		setTimeout(function(){vol.finishedReadData(vol)}, 0);
	}
}


/**
 * Callback to run after decompressing data.
 * @param {Volume} vol	the volume
 * @param {ArrayBuffer} data	the inflated buffer
 */
papaya.volume.Volume.prototype.finishedDecompress = function(vol, data) {
	vol.rawData = data;
	setTimeout(function(){vol.finishedReadData(vol)}, 0);
}


/**
 * Callback to run after reading data.
 * @param {Volume} vol	the volume
 */
papaya.volume.Volume.prototype.finishedReadData = function(vol) {
	vol.header.readData(vol.headerType, vol.rawData);
	
	this.swap16 = (this.header.imageType.numBytes == 2) && (this.header.imageType.littleEndian != isPlatformLittleEndian());
	this.swap32 = (this.header.imageType.numBytes == 4) && (this.header.imageType.littleEndian != isPlatformLittleEndian());
	
	if (vol.header.hasError()) {
		vol.errorMessage = vol.header.errorMessage;
		vol.onFinishedRead(vol);
		return;
	}

	vol.imageData.readData(vol.header, vol.rawData, bind(this, vol.finishedLoad));
}


/**
 * Callback to run after loading data is complete.
 */
papaya.volume.Volume.prototype.finishedLoad = function() {
	if (this.onFinishedRead) {
		this.rawData = null;
		this.onFinishedRead(this);
	}
}
