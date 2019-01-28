// A context is an array of (name, type) tiples
class Context {
  constructor(binds = null) {
    this.binds = binds;
  }

  // Extends the context with a term, shifting accourdingly
  extend(binder) {
    return new Context({bind: binder, rest: this.binds});
  }

  get_bind(index) {
    var binds = this.binds;
    for (var i = 0; i < index; ++i) {
      binds = binds && binds.rest;
    }
    return binds ? binds.bind : null;
  }

  // Returns the name of an element given its index,
  // avoiding capture by appending 's if needed
  get_name(index) {
    var bind = this.get_bind(index);
    if (!bind) { 
      return null;
    } else {
      var bruijn = "";
      var binds = this.binds;
      for (var i = 0; i < index; ++i) {
        if (binds.bind[0] === bind[0]) {
          bruijn += "'";
        }
        binds = binds.rest;
      }
      return bind[0] + bruijn;
    }
  }

  // Returns the type of an element given its index
  get_type(index) {
    var bind = this.get_bind(index);
    return bind ? bind[1].shift(0, index) : null;
  }

  // Returns the term on given index
  get_term(index) {
    var bind = this.get_bind(index);
    return bind ? bind[2].shift(0, index) : null;
  }

  // Finds a term by its name, skipping a number of terms
  // (this allows the x''' syntax be used to address shadowed vars)
  find_by_name(find_name, skip) {
    var binds = this.binds;
    var index = 0;
    while (binds) {
      var [name, type, term] = binds.bind;
      if (find_name === name) {
        if (skip > 0) {
          skip -= 1;
        } else {
          return [name, type && type.shift(0, index), term && term.shift(0, index)];
        }
      }
      index += 1;
      binds = binds.rest;
    }
    return null;
  }

  // Pretty prints a context
  show() {
    var text = "";
    var binds = this.binds;
    var index = 0;
    while (binds) {
      var [name, type, term] = binds.bind;
      text = "- " + name + " : " + (term ? type.shift(0, index).norm(false, this).to_string(true, this) : "?") + "\n"
           + "- " + name + " = " + (term ? term.shift(0, index).norm(false, this).to_string(true, this) : "?") + "\n~\n" + text;
      binds = binds.rest;
      index += 1;
    }
    return text;
  }

  // Formats a type-mismatch error message
  show_mismatch(expect, actual, value) {
    var text = "";
    text += "[ERROR]\nType mismatch on " + value() + ".\n";
    text += "- Expect = " + expect.norm(false, this).to_string(true, this) + "\n";
    text += "- Actual = " + actual.norm(false, this).to_string(true, this) + "\n"
    text += "\n[CONTEXT]\n" 
    text += this.show();
    return text;
  }

  check_match(expect, actual, value) {
    try {
      var checks = this.equals(expect, actual);
      var unsure = false;
    } catch (e) {
      var checks = false;
      var unsure = true;
    }
    if (!checks) {
      throw this.show_mismatch(expect, actual, value) + (unsure ? "(Couldn't decide if terms are equal.)" : "");
    }
  }

  equals(a, b) {
    return equals(a.subst(this), b.subst(this));
  }

  subst(term, value) {
    return term.subst(this.extend(["", null, value.shift(0, 1)])).shift(0, -1);
  }
}

// Variable
class Var {
  constructor(index) {
    this.index = index; // Number
  }

  to_string(erased = false, context = new Context()) {
    return context.get_name(this.index) || "#" + this.index;
  }

  shift(depth, inc) {
    return new Var(this.index < depth ? this.index : this.index + inc);
  }

  uses(depth) {
    return this.index === depth ? 1 : 0;
  }

  stratified(depth, level) {
    return this.index === depth ? level === 0 : true;
  }

  subst(context = new Context()) {
    return context.get_term(this.index) || this;
  }

  head(dref) {
    return this;
  }

  norm(dref, context = new Context()) {
    return this.subst(context);
  }

  check(context = new Context()) {
    return context.get_type(this.index);
  }
}

// Type of types
class Typ {
  constructor() {
  }

  to_string(erased = false, context = new Context()) {
    return "Type";
  }

  shift(depth, inc) {
    return new Typ();
  }

  uses(depth) {
    return 0;
  }

  stratified(depth, level) {
    return true;
  }

  subst(context = new Context()) {
    return new Typ();
  }

  head(dref) {
    return this;
  }

  norm(dref, context = new Context()) {
    return new Typ();
  }

  check(context = new Context()) {
    return new Typ();
  }
}

// Lambda (type): {x : A} B
class All {
  constructor(eras, name, bind, body) {
    this.eras = eras; // Bool (true if erased)
    this.name = name; // String (argument name)
    this.bind = bind; // Term (argument type)
    this.body = body; // Term (function body)
  }

  to_string(erased = false, context = new Context()) {
    var eras = this.eras ? "-" : "";
    var name = this.name;
    var bind = " : " + this.bind.to_string(erased, context);
    var body = this.body.to_string(erased, context.extend([this.name, null, null]));
    return "{" + eras + name + bind + "} " + body;
  }

  shift(depth, inc) {
    var eras = this.eras;
    var name = this.name;
    var bind = this.bind.shift(depth, inc);
    var body = this.body.shift(depth + 1, inc);
    return new All(eras, name, bind, body);
  }

  uses(depth, inc) {
    return 0;
  }

  stratified(depth, level) {
    return true;
  }

  subst(context = new Context()) {
    var eras = this.eras;
    var name = this.name;
    var bind = this.bind.subst(context);
    var body = this.body.subst(context.extend([this.name, null, new Var(0)]));
    return new All(eras, name, bind, body);
  }

  head(dref) {
    return this;
  }

  norm(dref, context = new Context()) {
    var eras = this.eras;
    var name = this.name;
    var bind = this.bind.subst(context);
    var body = this.body.norm(dref, context.extend([this.name, null, new Var(0)]));
    return new All(eras, name, bind, body);
  }

  check(context = new Context()) {
    return new Typ();
  }
}

// Lambda (value): [x : A] t
class Lam {
  constructor(eras, name, bind, body) {
    this.eras = eras; // Bool (true if erased)
    this.name = name; // String (argument name)
    this.bind = bind; // Term (argument type)
    this.body = body; // Term (function body)
  }

  to_string(erased = false, context = new Context()) {
    var eras = this.eras ? "-" : "";
    var name = erased && this.eras ? "*" : this.name;
    var bind = this.bind ? " : " + this.bind.to_string(erased, context) : "";
    var body = this.body.to_string(erased, context.extend([name, null, null]));
    if (erased) {
      return this.eras ? body : "[" + name + "] " + body;
    } else {
      return "[" + eras + name + bind + "] " + body;
    }
  }

  shift(depth, inc) {
    var eras = this.eras;
    var name = this.name;
    var bind = this.bind && this.bind.shift(depth, inc);
    var body = this.body.shift(depth + 1, inc);
    return new Lam(eras, name, bind, body);
  }
  
  uses(depth) {
    return this.body.uses(depth + 1);
  }

  stratified(depth, level) {
    return this.body.stratified(depth + 1, level);
  }

  subst(context = new Context()) {
    var eras = this.eras;
    var name = this.name;
    var bind = this.bind && this.bind.subst(context);
    var body = this.body.subst(context.extend([this.name, null, new Var(0)]));
    return new Lam(eras, name, bind, body);
  }

  head(dref) {
    return this;
  }

  norm(dref, context = new Context()) {
    var eras = this.eras;
    var name = this.name;
    var bind = this.bind && this.bind.subst(context);
    var body = this.body.norm(dref, context.extend([this.name, null, new Var(0)]));
    return new Lam(eras, name, bind, body);
  }

  check(context = new Context()) {
    if (this.bind === null) {
      throw "[ERROR]\nCan't infer non-annotated lambda. Context:\n" + context.show();
    } else if (this.body.uses(0) > 1) {
      throw "[ERROR]\nNon-linear function on: `" + this.to_string(true, context) + "`."
          + "\nVariable '" + this.name + "' used " + this.body.uses(0) + " times.";
    } else if (!this.body.stratified(0, 0)) {
      throw "[ERROR]\nNon-stratified function on: `" + this.to_string(true, context) + "`."
          + "\nUses of variable '" + this.name + "' can't have enclosing boxes.";
    } else {
      var eras = this.eras;
      var name = this.name;
      var bind = this.bind;
      var body = this.body.check(context.extend([name, bind.shift(0, 1), new Var(0)]));
      return new All(eras, name, bind, body);
    }
  }
}

// Lambda (elim): (f x y z ...)
class App {
  constructor(eras, func, argm) {
    this.eras = eras; // Bool (true if erased)
    this.func = func; // Term (the function)
    this.argm = argm; // Term (the argument)
  }

  to_string(erased = false, context = new Context()) {
    var text = ")";
    var self = this;
    while (self instanceof App) {
      if (erased && self.eras) {
        self = self.func;
      } else {
        text = " " + (self.eras ? "-" : "") + self.argm.to_string(erased, context) + text;
        self = self.func;
      }
    }
    return "(" + self.to_string(erased, context) + text;
  }

  shift(depth, inc) {
    var eras = this.eras;
    var func = this.func.shift(depth, inc);
    var argm = this.argm.shift(depth, inc);
    return new App(eras, func, argm);
  }

  uses(depth) {
    return this.func.uses(depth) + (this.eras ? 0 : this.argm.uses(depth));
  }

  stratified(depth, level) {
    return this.func.stratified(depth, level) && (this.eras || this.argm.stratified(depth, level));
  }

  subst(context = new Context()) {
    var eras = this.eras;
    var func = this.func.subst(context);
    var argm = this.argm.subst(context);
    return new App(eras, func, argm);
  }

  head(dref) {
    var func = this.func.head(dref);
    if (func instanceof Lam) {
      return new Context().subst(func.body, this.argm).head(dref);
    } else {
      return this;
    }
  }

  norm(dref, context = new Context()) {
    var func = this.func.norm(dref, context);
    if (func instanceof Lam) {
      return context.subst(func.body, this.argm).norm(dref, context);
    } else {
      var eras = this.eras;
      var argm = eras ? this.argm.subst(context) : this.argm.norm(dref, context);
      return new App(eras, func, argm);
    }
  }

  check(context = new Context()) {
    var func_t = this.func.check(context).subst(context).head(true);
    var argm_t = this.argm.check(context);
    if (!(func_t instanceof All)) {
      throw "[ERROR]\nNon-function application on `" + this.to_string(true, context) + "`.\n- Context:\n" + context.show();
    }
    if (func_t.eras !== this.eras) {
      throw "[ERROR]\nMismatched erasure on " + this.to_string(true, context) + ".";
    }
    context.check_match(func_t.bind, argm_t, () => "application: `" + this.to_string(false, context) + "`");
    return context.subst(func_t.body, this.argm);
  }
}

// Copy (type): !A
class Put {
  constructor(term) {
    this.term = term;
  }

  to_string(erased = false, context = new Context()) {
    return "|" + this.term.to_string(erased, context);
  }

  shift(depth, inc) {
    return new Put(this.term.shift(depth, inc));
  }

  uses(depth) {
    return this.term.uses(depth);
  }

  stratified(depth, level) {
    return this.term.stratified(depth, level + 1);
  }

  subst(context = new Context()) {
    return new Put(this.term.subst(context));
  }

  head(dref) {
    return this;
  }

  norm(dref, context = new Context()) {
    return new Put(this.term.norm(dref, context));
  }

  check(context = new Context()) {
    return new Box(this.term.check(context));
  }
}

// Copy (value): |a 
class Box {
  constructor(term) {
    this.term = term;
  }

  to_string(erased = false, context = new Context()) {
    return "!" + this.term.to_string(erased, context);
  }

  shift(depth, inc) {
    return new Box(this.term.shift(depth, inc));
  }

  uses(depth) {
    return 0;
  }

  stratified(depth, level) {
    return true;
  }

  subst(context = new Context()) {
    return new Box(this.term.subst(context));
  }

  head(dref) {
    return this;
  }

  norm(dref, context = new Context()) {
    return new Box(this.term.norm(dref, context));
  }

  check(context = new Context()) {
    var term_t = this.term.check(context);
    if (!context.equals(term_t, new Typ())) {
      throw "Boxed term not a type:" + this.to_string(context) + "\n- Context:\n" + context.show();
    }
    return new Typ();
  }
}

// Copy (elim): copy x a b
class Cpy {
  constructor(name, copy, body) {
    this.name = name; // String
    this.copy = copy; // Term
    this.body = body; // Term
  }

  to_string(erased = false, context = new Context()) {
    var name = this.name;
    var copy = this.copy.to_string(erased, context);
    var body = this.body.to_string(erased, context.extend([this.name, null, new Var(0)]));
    return "[" + name + " = " + copy + "] " + body;
  }

  shift(depth, inc) {
    var name = this.name;
    var copy = this.copy.shift(depth, inc);
    var body = this.body.shift(depth + 1, inc);
    return new Cpy(name, copy, body);
  }

  uses(depth) {
    return this.copy.uses(depth) + this.body.uses(depth + 1);
  }

  stratified(depth, level) {
    return this.copy.stratified(depth, level) && this.body.stratified(depth + 1, level);
  }

  subst(context = new Context()) {
    var name = this.name;
    var copy = this.copy.subst(context);
    var body = this.body.subst(context.extend([this.name, null, new Var(0)]));
    return new Cpy(name, copy, body);
  }

  head(dref) {
    var copy = this.copy.head(dref);
    if (copy instanceof Put) {
      return new Context().subst(this.body, copy.term).head(dref);
    } else {
      return this;
    }
  }

  norm(dref, context = new Context()) {
    var copy = this.copy.norm(dref, context);
    if (copy instanceof Put) {
      return context.subst(this.body, copy.term).norm(dref, context);
    } else {
      var name = this.name;
      var body = this.body.norm(dref, context);
      return new Cpy(name, copy, body);
    }
  }

  check(context = new Context()) {
    var copy_t = this.copy.check(context);
    if (!(copy_t instanceof Box)) {
      throw "Copy of unboxed value: `" + this.copy.to_string(context) + "`.";
    } else if (!this.body.stratified(0, -1)) {
      throw "[ERROR]\nNon-stratified duplication on: `" + this.to_string(true, context) + "`."
          + "\nUses of variable '" + this.name + "' must have exactly 1 enclosing box.";
    } else {
      var body_c = context.extend([this.name, copy_t.term.shift(0, 1), this.copy.shift(0, 1)]);
      return context.subst(this.body.check(body_c), this.copy);
    }
  }
}

// Self (type)
class Slf {
  constructor(name, body) {
    this.name = name;
    this.body = body;
  }

  to_string(erased = false, context = new Context()) {
    return "@ " + this.name + " : " + this.body.to_string(erased, context.extend([this.name, null, null]));
  }

  shift(depth, inc) {
    return new Slf(this.name, this.body.shift(depth + 1, inc));
  }

  uses(depth) {
    return 0;
  }

  stratified(depth, level) {
    return true;
  }

  subst(context = new Context()) {
    return new Slf(this.name, this.body.subst(context.extend([this.name, null, new Var(0)])));
  }

  head(dref) {
    return this;
  }

  norm(dref, context = new Context()) {
    return new Slf(this.name, this.body.norm(dref, context.extend([this.name, null, new Var(0)])));
  }

  check(context = new Context()) {
    return this.body.check(context.extend([this.name, this.shift(0, 1), new Var(0)]));
  }
}

// Self (value)
class New {
  constructor(type, term) {
    this.type = type;
    this.term = term;
  }

  to_string(erased = false, context = new Context()) {
    if (erased) {
      return this.term.to_string(erased, context);
    } else {
      return ": " + this.type.to_string(erased, context) + " = " + this.term.to_string(erased, context);
    }
  }

  shift(depth, inc) {
    return new New(this.type.shift(depth, inc), this.term.shift(depth, inc));
  }

  uses(depth) {
    return this.term.uses(depth);
  }

  stratified(depth, level) {
    return this.term.stratified(depth, level);
  }

  subst(context = new Context()) {
    return new New(this.type.subst(context), this.term.subst(context));
  }

  head(dref) {
    return this.term.head(dref);
  }

  norm(dref, context = new Context()) {
    return this.term.norm(dref, context);
  }

  check(context = new Context()) {
    var type_h = this.type.subst(context).head(true);
    if (!(type_h instanceof Slf)) {
      throw "[ERROR]\nNot a self type on: " + this.to_string(true, context);
    }
    var term_t = this.term.check(context);
    context.check_match(context.subst(type_h.body, this.term), term_t, () => "instantiation `" + this.to_string(true, context) + "`");
    return this.type;
  }
}

// Self (elim)
class Use {
  constructor(term) {
    this.term = term;
  }

  to_string(erased = false, context = new Context()) {
    return (erased ? "" : "~ ") + this.term.to_string(erased, context);
  }

  shift(depth, inc) {
    return new Use(this.term.shift(depth, inc));
  }

  uses(depth) {
    return this.term.uses(depth);
  }

  stratified(depth, level) {
    return this.term.stratified(depth, level);
  }

  subst(context = new Context()) {
    return new Use(this.term.subst(context));
  }

  head(dref) {
    return this.term.head(dref);
  }

  norm(dref, context = new Context()) {
    return this.term.norm(dref, context);
  }

  check(context = new Context()) {
    var term_t = this.term.check(context).head(true);
    if (!(term_t instanceof Slf)) {
      throw "[ERROR]\nNot a self-typed term on: " + this.to_string(true, context);
    }
    return context.subst(term_t.body, this.term);
  }
}

// Gives a local name to a term. Useful for context inspection.
class Let {
  constructor(name, term, body) {
    this.name = name; // String
    this.term = term; // Term
    this.body = body; // Term
  }

  to_string(erased = false, context = new Context()) {
    var name = this.name;
    var term = this.term.to_string(erased, context);
    var body = this.body.to_string(erased, context.extend([this.name, null, null]));
    return "let " + name + " " + term + " " + body;
  }

  shift(depth, inc) {
    var name = this.name;
    var term = this.term.shift(depth, inc);
    var body = this.body.shift(depth + 1, inc);
    return new Let(name, term, body);
  }

  uses(depth) {
    return this.term.uses(depth) + this.body.uses(depth + 1);
  }

  stratified(depth, level) {
    return this.term.stratified(depth, level) && this.body.stratified(depth + 1, level);
  }

  subst(context = new Context()) {
    var name = this.name;
    var term = this.term.subst(context);
    var body = this.body.subst(context.extend([this.name, null, new Var(0)]));
    return new Let(name, term, body);
  }

  head(dref) {
    return new Context().subst(this.body, this.term).head(dref);
  }

  norm(dref, context = new Context()) {
    return context.subst(this.body, this.term).norm(dref, context);
  }

  check(context = new Context()) {
    var term_t = this.term.check(context);
    var body_c = context.extend([this.name, term_t.shift(0, 1), this.term.shift(0, 1)]);
    return context.subst(this.body.check(body_c), this.term);
  }
}

// A reference to a closed term. Used to preserve names and cache types.
class Ref {
  constructor(name, term) {
    this.name = name; // String
    this.term = term; // Term
    this.type = null; // Maybe Term
  }

  to_string(erased = false, context = new Context()) {
    return this.name;
  }

  shift(depth, inc) {
    return this;
  }

  uses(depth) {
    return 0;
  }

  stratified(depth, level) {
    return true;
  }

  subst(context = new Context()) {
    return this;
  }

  head(dref) {
    return dref ? this.term.head(dref) : this;
  }

  norm(dref, context = new Context()) {
    return dref ? this.term.norm(dref, context) : this;
  }

  check(context = new Context()) {
    this.type = this.type || this.term.check(context);
    return this.type;
  }
}

// A hole. Used to force a type error and internally for undefined references.
class Nil {
  constructor(term) {
    this.term = term;
  }

  to_string(erased = false, context = new Context()) {
    return this.term ? this.term.to_string(erased, context) : "*";
  }

  shift(depth, inc) {
    return this.term ? this.term.shift(depth, inc) : this;
  }

  uses(depth) {
    return this.term ? this.term.uses(depth) : 0;
  }

  stratified(depth, level) {
    return this.term ? this.term.stratified(depth, level) : true;
  }

  subst(context = new Context()) {
    return this.term ? this.term.subst(context) : this;
  }

  head(dref) {
    return this.term ? this.term.head(dref) : this;
  }

  norm(dref, context = new Context()) {
    return this.term ? this.term.norm(dref, context) : this;
  }

  check(context = new Context()) {
    if (this.term) {
      return this.term.check(context);
    } else {
      throw "[ERROR]\nHole found.\n\n[CONTEXT]\n" + context.show();
    }
  }
}

// Checks if two terms are equal.
function equals(a, b) {
  // Checks if both terms are already identical
  var a = a.head(false);
  var b = b.head(false);
  if ( a instanceof Ref && b instanceof Ref && a.name === b.name
    || a instanceof App && b instanceof App && equals(a.func, b.func) && equals(a.argm, b.argm)
    || a instanceof Cpy && b instanceof Cpy && equals(a.copy, b.copy) && equals(a.body, b.body)) {
    return true;
  }
  // Otherwise, reduces to weak head normal form are equal and recurse
  var a = a.head(true);
  var b = b.head(true);
  if (a instanceof App && a.eras) {
    return equals(a.func, b);
  }
  if (a instanceof Lam && a.eras) {
    return equals(a.body, b);
  }
  if (b instanceof App && b.eras) {
    return equals(a, b.func);
  }
  if (b instanceof Lam && b.eras) {
    return equals(a, b.body);
  }
  if (a instanceof Typ && b instanceof Typ) {
    return true;
  } else if (a instanceof All && b instanceof All) {
    var eras = a.eras === b.eras;
    var bind = equals(a.bind, b.bind);
    var body = equals(a.body, b.body);
    return eras && bind && body;
  } else if (a instanceof Lam && b instanceof Lam) {
    var body = equals(a.body, b.body);
    return body;
  } else if (a instanceof App && b instanceof App) {
    var func = equals(a.func, b.func);
    var argm = equals(a.argm, b.argm);
    return func && argm;
  } else if (a instanceof Var && b instanceof Var) {
    return a.index == b.index;
  } else if (a instanceof Slf && b instanceof Slf) {
    var body = equals(a.body, b.body);
    return body;
  } else if (a instanceof Put && b instanceof Put) {
    var term = equals(a.term, b.term);
    return term;
  } else if (a instanceof Box && b instanceof Box) {
    var term = equals(a.term, b.term);
    return term;
  } else if (a instanceof Cpy && b instanceof Cpy) {
    var copy = equals(a.copy, b.copy);
    var body = equals(a.body, b.body);
    return term && body;
  }
  return false;
}

// Converts a string to a term.
function parse(code) {
  var index = 0;
  var unbound_refs = [];

  function is_space(char) {
    return char === " " || char === "\t" || char === "\n";
  }

  function is_name_char(char) {
    return "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.&".indexOf(char) !== -1;
  }

  function skip_spaces() {
    while (index < code.length && is_space(code[index])) {
      index += 1;
    }
    return index;
  }

  function match(string) {
    skip_spaces();
    var sliced = code.slice(index, index + string.length);
    if (sliced === string) {
      index += string.length;
      return true;
    }
    return false;
  }

  function error(text) {
    text += "This is the relevant code:\n\n<<<";
    text += code.slice(index - 64, index) + "<<<HERE>>>";
    text += code.slice(index, index + 64) + ">>>";
    throw text;
  }

  function parse_exact(string) {
    if (!match(string)) {
      error("Parse error, expected '" + string + "'.\n");
    }
  }

  function parse_name() {
    skip_spaces();
    var name = "";
    while (index < code.length && is_name_char(code[index])) {
      name = name + code[index];
      index += 1;
    }
    return name;
  }

  function parse_term(context) {
    // Comment
    if (match("--")) {
      while (index < code.length && code[index] !== "\n") {
        index += 1;
      }
      return parse_term(context);
    }

    // Application
    else if (match("(")) {
      var func = parse_term(context);
      while (index < code.length && !match(")")) {
        var eras = match("-");
        var argm = parse_term(context);
        var func = new App(eras, func, argm);
        skip_spaces();
      }
      return func;
    }

    // Type
    else if (match("Type")) {
      return new Typ();
    }

    // Forall
    else if (match("{")) {
      var eras = match("-");
      var name = parse_name();
      var skip = parse_exact(":");
      var bind = parse_term(context);
      var skip = parse_exact("}");
      var body = parse_term(context.extend([name, null, new Var(0)]));
      return new All(eras, name, bind, body);
    }

    // Lambda / copy
    else if (match("[")) {
      var eras = match("-");
      var name = parse_name();
      var copy = match("=") ? parse_term(context) : null;
      var bind = match(":") ? parse_term(context) : null;
      var skip = parse_exact("]");
      var body = parse_term(context.extend([name, null, new Var(0)]));
      if (copy) {
        return new Cpy(name, copy, body);
      } else {
        return new Lam(eras, name, bind, body);
      }
    }

    // Slf
    else if (match("@")) {
      var name = parse_name(context);
      var skip = parse_exact(":");
      var body = parse_term(context.extend([name, null, new Var(0)]));
      return new Slf(name, body);
    }

    // New
    else if (match(":")) {
      var type = parse_term(context);
      var skip = parse_exact("=");
      var term = parse_term(context);
      return new New(type, term);
    }

    // Use
    else if (match("~")) {
      var term = parse_term(context);
      return new Use(term);
    }

    // Put
    else if (match("|")) {
      var term = parse_term(context);
      return new Put(term);
    }

    // Box
    else if (match("!")) {
      var term = parse_term(context);
      return new Box(term);
    }

    // Definition
    else if (match("def")) {
      var name = parse_name();
      var term = parse_term(context);
      var tref = new Ref(name, term, true)
      var body = parse_term(context.extend([name, null, tref.shift(0, 1)]));
      for (var i = 0; i < (unbound_refs[name] || []).length; ++i) {
        unbound_refs[name][i].term = tref;
      }
      delete unbound_refs[name];
      return body.shift(0, -1);
    }

    // Local definition
    else if (match("let")) {
      var name = parse_name();
      var term = parse_term(context);
      var body = parse_term(context.extend([name, null, new Var(0)]));
      return new Let(name, term, body);
    }

    // Hole
    else if (match("*")) {
      return new Nil(null);
    }

    // Variable (named)
    else {
      var name = parse_name();
      var skip = 0;
      while (match("'")) {
        skip += 1;
      }
      var bind = context.find_by_name(name, skip);
      if (bind) {
        return bind[2];
      } else {
        var term = new Nil(null);
        if (!unbound_refs[name]) {
          unbound_refs[name] = [];
        }
        unbound_refs[name].push(term);
        return term;
      }
    }
  }

  var term = parse_term(new Context());

  var unbound_names = Object.keys(unbound_refs);
  if (unbound_names.length > 0) {
    throw "Use of undefined variables: " + unbound_names.join(", ") + ".\n";
  }

  return term;
}

module.exports = {Context, Var, Typ, All, Lam, App, Put, Box, Cpy, Slf, New, Use, Let, Ref, Nil, equals, parse};
