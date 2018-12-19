"""
< Nat  : Type
| Succ : {x : Nat} Nat
| Zero : Nat >
--------------
type  =            {Nat : Type} {Succ : {x : Nat} Nat} {Zero : Nat} Nat
@Succ = [n : !Nat] [Nat : Type] [Succ : {x : Nat} Nat] [Zero : Nat] (Succ (n Nat Succ Zero))
@Zero =            [Nat : Type] [Succ : {x : Nat} Nat] [Zero : Nat] Zero
ind   = <self> {P : {self : !Nat} Type} {Succ : {x' : !Nat} {x : (P x')} (P (@Nat.Succ x'))} {Zero : (P @Nat.Zero)} (P self)

< Ind  : {n : !Nat} Type
| Step : {n : !Nat} {i : (Ind n)} (Ind (@Nat.succ n))
| Base : (Ind @Nat.Zero) >
--------------------------
type  = [n : !Nat]                {Ind : {x : !Nat} Type} {Step : {n : !Nat} {i : (Ind n)} (Ind (@Nat.Succ n))} {Base : (Ind @Nat.Zero)} (Ind n)
@Step = [n : !Nat] [i : (!Ind n)] [Ind : {x : !Nat} Type] [Step : {n : !Nat} {i : (Ind n)} (Ind (@Nat.Succ n))] [Base : (Ind @Nat.Zero)] (Step n (i Ind Step Base))
@Base =                           [Ind : {x : !Nat} Type] [Step : {n : !Nat} {i : (Ind n)} (Ind (@Nat.Succ n))] [Base : (Ind @Nat.Zero)] Base
ind   = <self> [P : {n : !Nat} {self : (!Ind n)} Type] [Step : {n : !Nat} {i' : (!Ind n)} {i : (P n i')} (P (@Nat.succ n) (@Ind.step n i'))] [Base : (Ind @Nat.Zero)] (P 
"""

import cProfile

class Context:
    def __init__(self, list = []):
        self.list = list

    def shift(self, depth, inc):
        new_list = []
        for binder in self.list:
            if binder is None:
                new_list.append(None)
            else:
                new_list.append((binder[0], binder[1].shift(depth, inc)))
        return Context(new_list)

    def extend(self, (name, term)):
        return Context([(name, term.shift(0, 1) if term else Var(0))] + self.shift(0, 1).list)

    def get(self, index):
        return self.list[index] if index < len(self.list) else None

    def find(self, name):
        for i in xrange(len(self.list)):
            if self.list[i][0] == name:
                return self.list[i]
        return None

def string_to_term(code):
    class Cursor:
        index = 0

    def is_space(char):
        return char in " \t\n"

    def is_name_char(char):
        return char in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"

    def skip_spaces():
        while Cursor.index < len(code) and is_space(code[Cursor.index]):
            Cursor.index += 1
        return Cursor.index

    def match(string):
        skip_spaces()
        sliced = code[Cursor.index : Cursor.index + len(string)]
        if sliced == string:
            Cursor.index += len(string)
            return sliced
        return False

    def parse_exact(string):
        if not match(string):
            raise(Exception("Parse error, expected '" + str(string) + "' at index " + str(Cursor.index) + "."))
        
    def parse_name():
        skip_spaces()
        name = ""
        while Cursor.index < len(code) and is_name_char(code[Cursor.index]):
            name = name + code[Cursor.index]
            Cursor.index += 1
        return name
        
    def parse_term(context):
        # Comment
        if match("--"):
            while Cursor.index < len(code) and code[Cursor.index] != "\n":
                Cursor.index += 1
            return parse_term(context)

        # Application
        elif match("("):
            func = parse_term(context)
            while Cursor.index < len(code) and not match(")"):
                argm = parse_term(context)
                func = App(func, argm)
                skip_spaces()
            return func

        # Type
        elif match("Type"):
            return Typ()

        # Forall
        elif match("{"):
            name = parse_name()
            skip = parse_exact(":")
            bind = parse_term(context)
            skip = parse_exact("}")
            body = parse_term(context.extend((name, None)))
            return All(name, bind, body)

        # Lambda
        elif match("["):
            name = parse_name()
            skip = parse_exact(":")
            bind = parse_term(context)
            skip = parse_exact("]")
            body = parse_term(context.extend((name, None)))
            return Lam(name, bind, body)

        # Definition
        elif match("def"):
            name = parse_name()
            term = parse_term(context)
            body = parse_term(context.extend((name, term)))
            return body

        # Data
        elif match("Data"):
            return Dat()

        # IDT
        elif match("<"):
            name = parse_name()
            skip = parse_exact(":")
            type = parse_term(context)
            ctrs = []
            while match("|"):
                ctr_name = parse_name()
                ctr_skip = parse_exact(":")
                ctr_type = parse_term(context.extend((name, None)))
                ctrs.append((ctr_name, ctr_type))
            parse_exact(">")
            return Idt(name, type, ctrs)

        # IDT Type
        elif match("!"):
            data = parse_term(context)
            return Ity(data)

        # IDT Constructor
        elif match("@"):
            data = parse_term(context)
            skip = parse_exact(".")
            name = parse_name()
            return Con(data, name)

        # IDT Induction
        elif match("&"):
            data = parse_term(context)
            term = parse_term(context)
            return Ind(data, term)

        # Variable (Bruijn indexed)
        elif match("#"):
            index = parse_name()
            return Var(int(index))

        # Variable (named)
        else:
            name = parse_name()
            bind = context.find(name)
            if bind:
                return bind[1]
            raise(Exception("Unbound variable: '" + str(name) + "' at index " + str(Cursor.index) + "-"))

    return parse_term(Context())

class Typ:
    def __init__(self):
        pass

    def to_string(self, context):
        return "Type"

    def shift(self, depth, inc):
        return Typ()

    def subst(self, depth, val):
        return Typ()

    def equal(self, other):
        return isinstance(other, Typ)

    def check(self, context):
        return Typ()

    def eval(self):
        return Typ()

class All:
    def __init__(self, name, bind, body):
        self.name = name
        self.bind = bind
        self.body = body

    def to_string(self, context):
        return "{" + self.name + " : " + self.bind.to_string(context) + "} " + self.body.to_string(context.extend((self.name, self.bind)))

    def shift(self, depth, inc):
        return All(self.name, self.bind.shift(depth, inc), self.body.shift(depth + 1, inc)) 

    def subst(self, depth, val):
        return All(self.name, self.bind.subst(depth, val), self.body.subst(depth + 1, val.shift(0, 1))) 

    def equal(self, other):
        return isinstance(other, All) and self.bind.equal(other.bind) and self.body.equal(other.body)

    def check(self, context):
        bind_t = self.bind.check(context)
        body_t = self.body.check(context.extend((self.name, self.bind)))
        if not bind_t.equal(Typ()) or not body_t.equal(Typ()):
            raise(Exception("Forall not a type."))
        return Typ()

    def eval(self):
        return All(self.name, self.bind.eval(), self.body.eval())

class Lam: 
    def __init__(self, name, bind, body):
        self.name = name
        self.bind = bind
        self.body = body

    def to_string(self, context):
        return "[" + self.name + " : " + self.bind.to_string(context) + "] " + self.body.to_string(context.extend((self.name, self.bind)))

    def shift(self, depth, inc):
        return Lam(self.name, self.bind.shift(depth, inc), self.body.shift(depth + 1, inc)) 

    def subst(self, depth, val):
        return Lam(self.name, self.bind.subst(depth, val), self.body.subst(depth + 1, val.shift(0, 1))) 

    def equal(self, other):
        return isinstance(other, Lam) and self.bind.equal(other.bind) and self.body.equal(other.body)

    def check(self, context):
        body_t = self.body.check(context.extend((self.name, self.bind)))
        result = All(self.name, self.bind, body_t)
        result.check(context).equal(Typ())
        return result

    def eval(self):
        return Lam(self.name, self.bind.eval(), self.body.eval())

class App:
    def __init__(self, func, argm):
        self.func = func
        self.argm = argm

    def to_string(self, context):
        return "(" + self.func.to_string(context) + " " + self.argm.to_string(context) + ")"

    def shift(self, depth, inc):
        return App(self.func.shift(depth, inc), self.argm.shift(depth, inc))

    def subst(self, depth, val):
        return App(self.func.subst(depth, val), self.argm.subst(depth, val))

    def equal(self, other):
        return isinstance(other, App) and self.func.equal(other.func) and self.argm.equal(other.argm)

    def check(self, context):
        func_t = self.func.check(context).eval()
        if not isinstance(func_t, All):
            raise(Exception("Non-function application."))
        argm_t = self.argm.check(context).eval()
        if not func_t.bind.equal(argm_t):
            raise(Exception("Type mismatch on '" + self.to_string(context) + "' application.\n"
                + "- Expected : " + func_t.bind.to_string(Context()) + "\n"
                + "- Actual   : " + argm_t.to_string(Context())))
        return func_t.body.subst(0, self.argm)

    def eval(self):
        func_v = self.func.eval()
        if not isinstance(func_v, Lam):
            return App(func_v, self.argm.eval())
        return func_v.body.subst(0, self.argm).eval()

class Var:
    def __init__(self, index):
        self.index = index

    def to_string(self, context):
        binder = context.get(self.index)
        if binder is not None:
            return binder[0]# + "#" + str(self.index)
        else:
            return "#" + str(self.index)

    def shift(self, depth, inc):
        return Var(self.index if self.index < depth else self.index + inc)

    def subst(self, depth, val):
        return val if depth == self.index else Var(self.index - (1 if self.index > depth else 0))

    def equal(self, other):
        return isinstance(other, Var) and self.index == other.index

    def check(self, context):
        return context.get(self.index)[1].eval()

    def eval(self):
        return Var(self.index)

class Dat:
    def __init__(self):
        pass

    def to_string(self, context):
        return "Data"

    def shift(self, depth, inc):
        return Dat()

    def subst(self, depth, val):
        return Dat()

    def equal(self, other):
        return isinstance(other, Dat)

    def check(self, context):
        return Typ()

    def eval(self):
        return Dat()

class Idt:
    def __init__(self, name, type, ctrs):
        self.name = name # string
        self.type = type # term
        self.ctrs = ctrs # [(string, term)]

    def to_string(self, context):
        result = "<" + self.name + " : " + self.type.to_string(context)
        for (i, (name, type)) in enumerate(self.ctrs):
            result += " | " + name + " : " + type.to_string(context.extend((self.name, self.type)))
        return result + ">"

    def shift(self, depth, inc):
        return Idt(self.name, self.type.shift(depth, inc), [(name, type.shift(depth + 1, inc)) for (name, type) in self.ctrs])

    def subst(self, depth, val):
        return Idt(self.name, self.type.subst(depth, val), [(name, type.subst(depth + 1, val.shift(0, 1))) for (name, type) in self.ctrs])

    def equal(self, other):
        return isinstance(other, Idt) and self.type.equal(other.type) and all([a[1].equal(b[1]) for (a,b) in zip(self.ctrs, other.ctrs)])

    def check(self, context):
        # TODO: check?
        return Dat()

    def eval(self):
        type = self.type.eval()
        ctrs = map(lambda (name, type): (name, type.eval()), self.ctrs)
        return Idt(self.name, type, ctrs) 

    @staticmethod
    def is_recursive(depth, field_type):
        if isinstance(field_type, App):
            return Idt.is_recursive(depth, field_type.func)
        elif isinstance(field_type, Var) and field_type.index == depth:
            return True
        return False

    def derive_induction(self, term, type):

        def build_motive(depth, type):
            #print ".. building motive"
            def adjust(depth, motive_type, self_type):
                #print ".... adjust depth="+str(depth)+" motive_type="+motive_type.to_string(Context())+" self_type="+self_type.to_string(Context())
                if isinstance(motive_type, All):
                    return All(motive_type.name, motive_type.bind, adjust(depth + 1, motive_type.body, App(self_type.shift(0, 1), Var(0))))
                else:
                    return All("self", self_type, motive_type)

            return All("P", adjust(depth, type.bind, self.derive_type()), build_constructors(depth + 1, type.body))

        def build_constructors(depth, type):
            if isinstance(type, All):
                #print ".. building constructor " + type.name
                def adjust(depth, fields_type, self_value): 
                    #print ".... adjust depth="+str(depth)+" fields_type=("+fields_type.to_string(Context())+") self_value=("+self_value.to_string(Context())+")"
                    if isinstance(fields_type, All):
                        #print ".... building field " + fields_type.name
                        #print "...... is recursive? depth="+str(depth)
                        if Idt.is_recursive(depth - 1, fields_type.bind):
                            #print "...... is recursive. field_type  ="+fields_type.bind.to_string(Context())
                            #print "......               substituted ="+fields_type.bind.subst(depth - 1, self.derive_type().shift(0, depth)).to_string(Context())
                            return (All(fields_type.name + "_", fields_type.bind.subst(depth - 1, self.derive_type().shift(0, depth)),
                                    All(fields_type.name, App(fields_type.bind.shift(0, 1), Var(0)),
                                    adjust(depth + 2, fields_type.body.shift(0, 1), App(self_value.shift(0, 2), Var(1))))))
                        else:
                            #print "...... is not recursive"
                            return All(fields_type.name, fields_type.bind, adjust(depth + 1, fields_type.body, App(self_value.shift(0, 1), Var(0))))
                    else:
                        #print ".... building return " + App(fields_type, self_value).to_string(Context())
                        return App(fields_type, self_value)
                return All(type.name, adjust(depth, type.bind, self.derive_constructor(type.name)), build_constructors(depth + 1, type.body))
            else:
                #print "building return type"
                return App(type, term)

        #print "building induction for " + term.to_string(Context()) + "   :   " + type.to_string(Context())

        return build_motive(0, type)

    def derive_type(self):
        def build_indices(depth, indices_type):
            if isinstance(indices_type, All):
                return Lam(indices_type.name, indices_type.bind, build_indices(depth + 1, indices_type.body))
            else:
                return build_motive(depth)

        def build_motive(depth):
            return All(self.name, self.type.shift(0, depth), build_constructor(depth + 1, 0))

        def build_constructor(depth, num):
            if num < len(self.ctrs):
                (name, type) = self.ctrs[num]
                return All(name, type.shift(1, depth).subst(0, Var(num)), build_constructor(depth + 1, num + 1))
            else:
                return build_return_type(depth)

        def build_return_type(depth):
            return_type = Var(len(self.ctrs))
            for i in xrange(depth - len(self.ctrs) - 1):
                return_type = App(return_type, Var(depth - i - 1))
            return return_type

        return build_indices(0, self.type)

    def derive_constructor(self, name):
        idt_type = self.derive_type()

        for (ctr_index, (ctr_name, ctr_type)) in enumerate(self.ctrs):
            if name == ctr_name:
                break

        def build_arguments(depth, fields_type):
            if isinstance(fields_type, All):
                return Lam(fields_type.name, fields_type.bind, build_arguments(depth + 1, fields_type.body))
            else:
                return build_constructor(depth)

        def build_constructor(depth):
            return build_fields(depth, ctr_type, 0, Var(len(self.ctrs) - ctr_index - 1))

        def build_fields(depth, fields_type, field_index, term):
            if isinstance(fields_type, All):
                field = Var(depth - field_index - 1)
                if Idt.is_recursive(field_index, fields_type.bind):
                    for i in xrange(len(self.ctrs) + 1):
                        field = App(field, Var(len(self.ctrs) - i))
                return build_fields(depth, fields_type.body, field_index + 1, App(term, field))
            else:
                return term

        return build_arguments(0, ctr_type.subst(0, idt_type).eval())

class Ity:
    def __init__(self, data):
        self.data = data

    def to_string(self, context):
        return "!" + self.data.to_string(context)

    def shift(self, depth, inc):
        return Ity(self.data.shift(depth, inc))

    def subst(self, depth, val):
        return Ity(self.data.subst(depth, val))

    def equal(self, other):
        return isinstance(other, Ity) and self.data.equal(other.data)

    def check(self, context):
        data_v = self.data.eval()
        if isinstance(data_v, Idt):
            return data_v.derive_type().check(context)
        else:
            # TODO: can we allow that?
            raise(Exception("Couldn't determine datatype statically: " + self.to_string(context)))

    def eval(self):
        data_v = self.data.eval()
        if isinstance(data_v, Idt):
            return data_v.derive_type()
        else:
            return Ity(data_v)

class Con:
    def __init__(self, data, name):
        self.data = data
        self.name = name

    def to_string(self, context):
        return "@" + self.data.to_string(context) + "." + self.name

    def shift(self, depth, inc):
        return Con(self.data.shift(depth, inc), self.name)

    def subst(self, depth, val):
        return Con(self.data.subst(depth, val), self.name)

    def equal(self, other):
        return isinstance(other, Con) and self.data.equal(other.data) and self.name == other.name

    def check(self, context):
        data_v = self.data.eval()
        if isinstance(data_v, Idt):
            return data_v.derive_constructor(self.name).check(context)
        else:
            # TODO: can we allow that?
            raise(Exception("Couldn't determine datatype statically: " + self.to_string(context)))

    def eval(self):
        data_v = self.data.eval()
        if isinstance(data_v, Idt):
            return data_v.derive_constructor(self.name)
        else:
            return Con(data_v, self.name)

class Ind:
    def __init__(self, data, term):
        self.data = data
        self.term = term

    def to_string(self, context):
        return "&" + self.data.to_string(context) + " " + self.term.to_string(context)

    def shift(self, depth, inc):
        return Ind(self.data.shift(depth, inc), self.name)

    def subst(self, depth, val):
        return Ind(self.data.subst(depth, val), self.name)

    def equal(self, other):
        return isinstance(other, Ind) and self.data.equal(other.data) and self.term.equal(other.term)

    def check(self, context):
        data_v = self.data.eval()
        if isinstance(data_v, Idt):
            return data_v.derive_induction(self.term, self.term.check(context))
        else:
            raise(Exception("Couldn't determine datatype statically: " + self.to_string(context)))

    def eval(self):
        return self.term.eval()

test = """
    -- Church nat
    def CNat           {P : Type} {S : {n : P} P} {Z : P} P
    def c0             [P : Type] [S : {n : P} P] [Z : P] Z
    def cS  [n : CNat] [P : Type] [S : {n : P} P] [Z : P] (S (n P S Z))
    def c1  [P : Type] [S : {n : P} P] [Z : P] (S Z)
    def c2  [P : Type] [S : {n : P} P] [Z : P] (S (S Z))
    def c3  [P : Type] [S : {n : P} P] [Z : P] (S (S (S Z)))
    def add [a : CNat] [b : CNat] [P : Type] [S : {x : P} P] [Z : P] (a P S (b P S Z))
    def mul [a : CNat] [b : CNat] [P : Type] [S : {x : P} P] [Z : P] (a P (b P S) Z)
    def the [P : Type] [x : P] x

    -- Church boolean
    def CBool {P : Type} {T : P} {F : P} P
    def CTrue [P : Type] [T : P] [F : P] T
    def CFals [P : Type] [T : P] [F : P] F

    def Bool
        < Bool  : Type
        | true  : Bool
        | false : Bool >

    def Nat
        < Nat  : Type
        | succ : {n : Nat} Nat
        | zero : Nat >

    def n0 @Nat.zero
    def n1 (@Nat.succ n0)
    def n2 (@Nat.succ n1)
    def n3 (@Nat.succ n2)
    def n4 (@Nat.succ n3)

    def NBits [n : !Nat]
        (n Data 
            [d : Data] <Bits : Type | O : {x : !d} Bits | I : {x : !d} Bits> 
            <Bits : Type | E : Bits>)

    def Ind 
        < Ind  : {n : !Nat} Type
        | step : {n : !Nat} {i : (Ind n)} (Ind (@Nat.succ n))
        | base : (Ind @Nat.Zero) >

    def i0 @Ind.base
    def i1 (@Ind.step n0 i0)
    def i2 (@Ind.step n1 i1)
    def i3 (@Ind.step n2 i2)
    def i4 (@Ind.step n3 i3)

    &Ind i2
"""

def foo():
    term = string_to_term(test)

    print "Input term:"
    print term.to_string(Context())
    print ""

    print "Normal form:"
    print term.eval().to_string(Context())
    print ""

    print "Inferred type:"
    print term.check(Context()).to_string(Context())
    print ""

foo()

#cProfile.run('foo()')
