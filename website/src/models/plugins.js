var _ = require('lodash');
var async = require('async');
var mongoose = require('mongoose');
var Task = require('./task').model;

function taskHelpers (schema, modelName) {

  modelName!=='User' && schema.virtual('tasks').get(function(){
    return _.reduce(this.habits.concat(this.dailys, this.todos, this.rewards), function(m,v,k){
      if (v) m[v._id] = v;
      return m;
    }, {});
  })

  schema.methods.toJSON = _.flow(schema.methods.toJSON, function(doc){
    _.merge(doc, _.pick(this, 'habits dailys todos rewards'.split(' ')));
    return doc;
  })

  schema.statics.withTasks = function (q, cb) {
    q = _.isString(q) ? {_id:q} : q;
    async.waterfall([
      function(cb2){
        mongoose.model(modelName).findOne(q, cb2);
      },
      function(obj, cb2){
        if (!obj) return cb2({code:404, message: modelName + " not found"});
        obj.populateTasks(cb2);
      }
    ], cb);
  };

  schema.methods.populateTasks = function(cb){
    var self = this;
    async.waterfall([
      function(cb2){
        Task.find({_owner: self._id}, cb2);
      },
      function(tasks, cb2){
        _.each(tasks, function(task){
          var type = task.type+'s';
          if (!self[type]) self[type] = [];
          self[type].push(task);
        });
        _.each('habits dailys todos rewards'.split(' '), function(category) {
          self[category] = self[category] || [];
        });
        cb2(null, self);
      }
    ], cb);
  }


  schema.methods.validateTasks = function(){
    // Don't validate tasks if the record hasn't been loaded with them.
    if(!this.habits) return;

    var self = this;

    _.each( self.habits.concat(self.todos, self.dailys, self.rewards) , function(v){
      if (!v) return;
      if (v.isModified && v.isModified()) {
        v.save();
      } else if (!v.isModified || v.isNew) { // is POJO or new model
        var task = new Task(v);
        task._owner=self._id;
        task.emit('new', task);
        //task.members.$add(self._id, v.members || {});
        //console.log(task.members);
        task.save();
        self[v.type+'s'].push(task);
      }
    })
  }

  schema.pre('save', function(next){
    this.validateTasks(); // todo: ensure this is called _after_ user.pre('save')
    next();
  })
}

module.exports = exports = {
  taskHelpers: taskHelpers
};
