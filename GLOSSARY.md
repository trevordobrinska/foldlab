# FoldLab

A private iPad app where one child practises origami without paper: he picks a Model, and the paper on screen waits for him to make each fold with his own gestures.

## Folding

**Model**:
A finished origami design that can be folded, such as a crane or a jumping frog.
_Avoid_: Project, design, figure, piece

**Step**:
One numbered step exactly as the Source shows it, made of one or more Folds. Symmetric Folds within a Step may be made in any order; "repeat behind" becomes real Folds, never skipped.
_Avoid_: Stage, instruction, move

**Fold**:
One action he makes on the paper, of a single Fold type, by touching the paper itself.
_Avoid_: Move, action, gesture

**Fold type**:
A named kind of fold from standard origami practice: valley, mountain, fold-and-unfold, squash, petal, inside reverse, outside reverse, rabbit ear, crimp, pleat, open sink, closed sink, swivel, plus the non-folds turn over, rotate and inflate.
_Avoid_: Move, technique, gesture (a gesture is how a fold is made, not what it is)

**Paper**:
The sheet a Model starts from: its shape (square or rectangle) and its two sides, each with a colour or pattern he may choose. The Source decides the default.
_Avoid_: Sheet, material

**Notation**:
The standard diagram symbols for showing a fold (the Yoshizawa–Randlett system of valley/mountain lines and arrows), the same ones in his books.
_Avoid_: Hints, icons, markers

## Library

**Library**:
Every Model available to fold in the app.
_Avoid_: Catalog, collection

**Source**:
Where a Model's instructions came from: an online diagram, page or video, or a photo of a page in one of his books.
_Avoid_: Origin, reference

**Import**:
Turning a Source into a Model automatically, ending with every Step replayed on the paper and checked. Nobody writes Models by hand.
_Avoid_: Authoring, conversion, upload

**Failed import**:
A Source whose Import could not be checked all the way through. It is held back for retry and never appears in the Library.
_Avoid_: Draft, broken model

**Mismatch report**:
His flag that a Step does not match the Source, which pulls the Model out of the Library until it is imported again.
_Avoid_: Bug report, complaint

**Difficulty**:
How hard a Model is: the Source's own rating when it has one, otherwise judged from its number of Steps and its hardest Fold type.
_Avoid_: Level, rating
