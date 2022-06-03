const appObj = {
    data() {
        return {
            s_input: "",
            term_input: "",
            nonterm_input: "",
            rules_input: "",
            res_output: "",
        }
    },

    methods: {
        test() {
            alert("lol");
        },

        insert_default() {
            this.s_input = "S";
            this.term_input = "a, b, c";
            this.nonterm_input = "A, B, C, D, E, F, G";
            this.rules_input = "S→aAB, S→E,\nA→aA, A→bB, A→ε, A→B,\nB→ACb, B→b, B→A,\nC→A, C→bA, C→cC, C→aE, C→B,\nD→a, D→c, D→Fb,\nE→cE, E→aE, E→Eb, E→ED, E→FG,\nF→BC, F→EC, F→AC,\nG→Ga, G→Gb";
        },

        process() { // Метод вызывается по нажатию кнопки, данные считываются из элементов а не через аргументы
            this.res_output = "";
            let s_nonterm = this.s_input;

            // Получаем правила
            let rules_sting = this.rules_input;
            // Но сначала очистим esc-последовательности перехода на другую строку (для всех платформ) и все пробелы
            let rules_array = rules_sting.replace(/(\r\n|\n|\r)/gm, "").replace(/\s/g, "").split(",");

            // После сплита по запятым, сплитим каждое правило на правую и левую части
            // (разделено красивой стрелкой, ее я всегда копирую и код элемента 2192 (alt + 26 на нам паде))
            let rules_obj_array = []
            rules_array.forEach(elem => {
                both_sides = elem.split("→");
                rules_obj_array.push({
                    left: both_sides[0],
                    right: both_sides[1]
                })
            });

            // Парсим терминалы и нетерминалы из других инпутов
            let terms_set = new Set(this.term_input.replace(/\s/g, "").split(","));
            let non_terms_set = new Set(this.nonterm_input.replace(/\s/g, "").split(","));

            start_grammar = {
                s: s_nonterm,
                terms: terms_set,
                nonterms: non_terms_set,
                rules: rules_obj_array,
                eps: "ε"
            };
            this.print_grammar(start_grammar);

            // Удаляем непроизводящие символы из правил
            this.delete_np(start_grammar);
            this.print_in_txtbox("\nУдаление непроизводящих символов:\n");
            this.print_grammar(start_grammar);

            // Удаляем недостижимые символы
            this.delete_nr(start_grammar);
            this.print_in_txtbox("\nУдаление недостижимых символов:\n");
            this.print_grammar(start_grammar);

            // Удаляем эпсилон-правила
            this.delete_eps(start_grammar);
            this.print_in_txtbox("\nУдаление ε-правил:\n");
            this.print_grammar(start_grammar);

            // Удаляем циклы
            this.delete_chained(start_grammar);
            this.print_in_txtbox("\nУдаление цепных правил:\n");
            this.print_grammar(start_grammar);
        },

        delete_np(grammar) {
            /*
                Удаление непроизводящих символов (Нетерминалов)
                Сначала во множество производящих добавляются те нетерминалы,
                которые слева в правиле в единственном экземпляре, и справа - только терминалы
                Далее условие проверки справа меняется - туда добавляется текущее множество
                производящих терминалов.
                Так, пока множество производящих терминалов перестанет менятся. Непроизводящие
                затем удаляются из множества и правил, задавая другую грамматику.

                Для корректной работы добавляю в множество эпсилон и удаляю оттуда в конце,
                алгоритм станет проще и отдельные проверки со сложными условиями производить
                не требуется
            */
            let np_set_old = new Set();
            let np_set = new Set(grammar.eps); // Множество производящих нетерминалов
            
            // выявляем сами производящие символы
            while (!this.is_sets_equal(np_set, np_set_old)) {
                np_set_old = new Set(np_set); // передавая конструктору множество оно поэлементно копируется в левую часть
                grammar.rules.forEach(rule => {
                    if (this.is_string_of_set_elems(rule.right, this.union_sets(grammar.terms, np_set))) {
                        np_set.add(rule.left);
                    }
                });
            }

            // Удаляем из правил все, что связано с непроизводящими: если такой слева или справа - то выкидываем
            function isProducing(rule_obj) {
                // я не знаю почему, но контекcт не замыкается, лол, продублировал здесь функцию
                function union_sets(setA, setB) {
                    var _union = new Set(setA);
                    for (var elem of setB) {
                        _union.add(elem);
                    }
                    return _union;
                }

                if (!np_set.has(rule_obj.left)) { return false; }
                for (let i = 0; i < rule_obj.right.length; i++) {
                    // объединение множества всех терминалов и текущих проихводящих нетерминалов (np_set)
                    if (!(union_sets(np_set, grammar.terms)).has(rule_obj.right[i])) {return false; }
                }

                return true;
            }

            // фильтр передает каждый элемент первым аргументом в функцию и оставляет только если вернется истина
            producable_rules_obj_arr = grammar.rules.filter(isProducing);

            // перезаписываем свойства в переданном объекте грамматики
            np_set.delete(grammar.s); // Не дублируем этот символ в нетерминалах
            np_set.delete(grammar.eps); // Этот тоже не нужен

            grammar.rules = producable_rules_obj_arr;
            grammar.nonterms = np_set;
        },

        delete_nr(grammar) {
            /*
                Удаление недостижимых символов. Начиная с начального символа грамматики, идем
                "направо", смотря какие символы (двух алфавитов) там есть, и добавляем в достижимые.
                Мн-во достижимых на этом этапе: S + <те_что_справа_от_S>
                Затем итеративно идем по всем правилам. Если нетерминал слева достижим (включен в мн-во), 
                то все справа кидаем в то же множество. Так идем пока итерация не приведет к изменениям.
                Затем удаляем те правила, где слева непроизводящий нетерминал, плюс чистим множество терминалов
            */

            // Чтобы не делать особую превую итерацию алгоритма, я просто закину в множество символ начала грамматики
            let reachable_set = new Set(String(grammar.s));
            let reachable_set_old = new Set();

            while (!this.is_sets_equal(reachable_set, reachable_set_old)){
                reachable_set_old = new Set(reachable_set);

                grammar.rules.forEach(rule => {
                    if (this.is_string_of_set_elems(rule.left, reachable_set)) {
                        for (let char_num = 0; char_num < rule.right.length; char_num += 1) {
                            reachable_set.add(rule.right[char_num]);
                        }
                    }
                })
            }

            function isReachable(rule_obj) {
                return reachable_set.has(rule_obj.left);
            }

            // Формируем массив новых правил. Нам достаточно рассматривать только левую часть
            reachable_rules_obj_arr = grammar.rules.filter(isReachable);

            // Так же формируем новые множества с символами
            function isInReachableSet(char) {
                return reachable_set.has(char);
            }

            reachable_terms_set = [...grammar.terms].filter(isInReachableSet);
            reachable_nonterms_set = [...grammar.nonterms].filter(isInReachableSet);

            grammar.rules = reachable_rules_obj_arr;
            grammar.terms = reachable_terms_set;
            grammar.nonterms = reachable_nonterms_set;
        },

        delete_eps(grammar) {
            /*
                Удаление эплилон-правил (ε - для копирования мне)
                Сначала ищем такие нетерминалы, которые непосредственно выводятся в эпсилон.
                Затем, ищем те, которые выводятся уже посредством найденых нетерминалов, причем
                в правиле справа могут быть только те нетерм-ы и сочетание тех нетерм-ов, которые
                уже в целевом множестве.

                Далее, модифицируем правила, удаляя в них все возможные комбинации нетерминалов из
                целевого множества, и то что вышло добавляем в следующую грамматику.
                Так, например при множестве {A, B} мы дополняем правило S→AB еще двумя: S→A, S→B.
            */

            eps_nonterms_set = new Set();
            eps_nonterms_set_old = new Set(["first_iter_req"]);

            while (!this.is_sets_equal(eps_nonterms_set, eps_nonterms_set_old)){
                eps_nonterms_set_old = new Set(eps_nonterms_set);
                
                grammar.rules.forEach(rule => {
                    if (rule.right == "ε" || this.is_string_of_set_elems(rule.right, eps_nonterms_set)) {
                        eps_nonterms_set.add(rule.left);
                    }
                });
            }

            /* (лучше свернуть если IDE позволяет)
                Алгоритм удаления всех коминаций немного сложный (функция distinct_permutation,
                название красивое, наверно вообще не имеет отношения к тому, что она делает, помогите)
                Например, добавляя из ABC: A, B, C, AB, BC, AC

                Но из ABCD: A, B, C, D, AB, AC, AD, BC, BD, CD, ABC, ACD, ABD, BCD

                Надо перебирать все уникальные позиции групп длинной меньше самой цепочки
                ABCD: 1, 2, 3, 4, 12, 13, 14, 23, 24, 34, 123, 124, 134, 234.
                1234

                1 - нету 2, 3, 4
                2 - нету 1, 3, 4
                3 - нету 1, 2, 4
                4 - нету 1, 2, 3, и так далее

                А дальше аниме закономерности
                -, 2, 3, 4
                1, -, 3, 4
                1, 2, -, 4
                1, 2, 3, -
                Получаем те же цепочки, что были последнеми четырьмя
                Если увеличим ширину "окошка", то просто выполним то же самое дважды
                (для ширины два: удаляем первое, потом последовательно вторым тире позиции 2, 3, 4)
                (для -, 2, 3, 4)
                -, -, 3, 4
                -, 2, -, 4
                -, 2, 3, -

                (для 1, -, 3, 4)
                -, -, 3, 4
                1, -, -, 4
                1, -, 3, -

                (для 1, 2, -, 4)
                -, 2, -, 4
                1, -, -, 4
                1, 2, -, -

                (для 1, 2, 3, -)
                -, 2, 3, -
                1, -, 3, -
                1, 2, -, -

                (только дубликатов много, это можно обработать отдельно, не работая с поддиагональю)
                То же для ширины 3, и так получаем те позиции, что остаются или удаляются (просто меняется порядок
                получения)
            */

            rules_without_eps = grammar.rules.filter((rule) => {return !(rule.right == "ε"); });
            // Теперь добавляем правила, заменяющие пустые
            rules_with_combos = new Array();
            
            rules_without_eps.forEach(rule => {
                rules_with_combos.push(rule);

                // Смотрю, есть ли целевые нетерминалы справа
                // Если есть, то получаю их индексы в строке и с помощью алгоритма сверху получаю комбинации
                if(this.is_string_contains_set_elem(rule.right, eps_nonterms_set)) {
                    nonterms_positions_arr = this.get_elems_poses_array(rule.right, eps_nonterms_set);
                    let delete_positions = null;

                    if (nonterms_positions_arr.length > 1) {
                        delete_positions = new Array(nonterms_positions_arr, ...this.get_distinct_permutation(nonterms_positions_arr));
                    } else {
                        // Значит длина = 1, Алгоритм бессмысленнен для массивов единичной длины
                        delete_positions = new Array(nonterms_positions_arr);
                    }

                    if (delete_positions != null){
                        delete_positions.forEach(pos_array => {
                            temp_rule = Object.assign({}, rule);
                            temp_string = "";
                            for (let i = 0; i < temp_rule.right.length; i += 1) {
                                if (!pos_array.includes(i)) { temp_string += temp_rule.right[i]; }
                            }

                            if (temp_string.length > 0) {
                                temp_rule.right = temp_string;
                                rules_with_combos.push(temp_rule);
                            }
                        });
                    }
                }
            });
            
            // Меняем грамматику
            grammar.rules = rules_with_combos;
        },

        delete_chained(grammar) {
            /*
                Удаление цепных правил
                Это правила вида A→B
                По сути, мы просто стираем их добавляем в правила все возможные комбинации
                их применения с существующими, делается это следующим образом:
                1. Смотрим, у каких нетерминалов (которые слева в правилах) вообще есть такие правила.
                Запоминаем, какие нетерминалы справа и удаляем эти правила.
                2. Строим новое множество правил, где все правила кроме цепных.
                3. Добавляем в новое множество правил еще правила согласно информации о терминалах справа
                у каждого терминала слева
                (A → B|D|C|abc, нетерм справа {B, C, D} у правого A, так с каждым нетерм (И цепные удалятся, да))
                Беря за основу пример выше, добавим те правила, у которых нетерминалы B, C, D слева,
                но заменим все левые на A
                (т.е. есть B→acv, D→ggg, мы добавим A→acv, A→ggg)

                И вроде все. Вроде звучит легко и идея понятна, но последний шаг в голове не укладывается(
            */

            let all_nonterms = new Array(...grammar.nonterms, grammar.s);
            let chained_nontemrs_arrays = new Array();

            // Сначала получаю нетерминалы, которые в цепных правилах справа
            all_nonterms.forEach(nonterm => {
                // Добавляю символ слева, чтобы знать о правилах какого нетерминала речь
                // соответственно, нулевой элемент чисто информационный, он не должен юзаться для построения новых правил
                let chained_nontems_array = new Array(nonterm);
                grammar.rules.forEach(rule => {
                    if (rule.left == nonterm && rule.right.length == 1 && grammar.nonterms.includes(rule.right)){
                        chained_nontems_array.push(rule.right);
                    }
                });
                if (chained_nontems_array.length > 1) {
                    // если длина 1 - то цепных нет
                    chained_nontemrs_arrays.push(chained_nontems_array);
                }
            });

            // Теперь удаляем сами цепные правила
            let new_rules = new Array();

            grammar.rules.forEach(rule => {
                if (    // слева и справа по одному нетерминалу
                        rule.left.length != 1
                        || rule.right.length != 1
                        || !grammar.nonterms.includes(rule.right)
                        || !grammar.nonterms.includes(rule.left)
                    ) {
                    new_rules.push(rule);
                }
            });

            /* 
                Добавляем новые правила согласно алгоритму выше. Сначала вытаскиваем нетерминалы,
                у которых были цепные. Добавляем правила из их множеств с замененным левым нетерминалом
                на них
            */

            chained_nontemrs_arrays.forEach(chained_nt => {
                target_nt = chained_nt.shift();
                // Нужно найти правила, где слева нетермы из `chained_nt` и поменять у них левую часть на `target_nt`
                // Добавим измененные правила к тем же новым правилам
                new_rules.forEach(rule => {
                    if (
                            rule.left.length == 1
                            && chained_nt.includes(rule.left)
                        ) {
                        temp_rule = Object.assign({}, rule);
                        temp_rule.left = target_nt;
                        new_rules.push(temp_rule);
                    }
                });
            });

            grammar.rules = new_rules;
            // Алгоритм отработал, но могли появится бесполезные правила и дубликаты правил, нужно их почистить
            this.clear_grammar(grammar);
        },

        clear_grammar(grammar) {
            let new_rules = new Array();
            grammar.rules.forEach(rule => {
                if (rule.right != rule.left && !this.is_rules_contains_rule(rule, new_rules)) {
                    new_rules.push(rule);
                }
            });

            grammar.rules = new_rules;
        },

        is_rules_contains_rule(rule, rules) {
            for (let i = 0; i < rules.length; i += 1){
                if (rule.right == rules[i].right && rule.left == rules[i].left) {
                    return true;                    
                }
            }
            return false;
        },

        get_distinct_permutation(elems_array) {

            function is_array_of_arrays_has(target_array, arrays) {
                for (let i = 0; i < arrays.length; i += 1) {
                    if (is_arrays_equal(arrays[i], target_array)) {
                        return true;
                    }
                }

                return false;
            }

            function is_arrays_equal(array_1, array_2) {
                if (array_1.length != array_2.length) {
                    return false;
                } else {
                    for (i = 0; i < array_1.length; i += 1) {
                        if (array_1[i] != array_2[i]) {
                            return false;
                        }
                    }
                }
                return true;
            }
            
            let result_array = new Array();

            let temp_array = new Array(elems_array);
            while(temp_array.length > 0) {
                curr_elem = temp_array.shift();

                for (let i = 0; i < curr_elem.length; i += 1) {
                    temp = [...curr_elem];
                    temp.splice(i, 1);

                    if (temp.length > 0 && !is_array_of_arrays_has(temp, result_array)) {
                        result_array.push(temp);
                        temp_array.push(temp);
                    }
                }
            }
            
            return result_array;
        },

        print_grammar(grammar) {
            this.print_in_txtbox("Начальный символ грамматики: ");
            this.print_in_txtbox(grammar.s + ';\n');

            this.print_in_txtbox("Множество терминалов: ");
            this.print_in_txtbox(this.terms_to_output_string(grammar.terms));

            this.print_in_txtbox("Множество нетерминалов: ");
            this.print_in_txtbox(this.terms_to_output_string(grammar.nonterms));

            this.print_in_txtbox("Правила:\n");
            this.print_in_txtbox(this.rules_to_output_string(grammar.rules));
        },

        terms_to_output_string(terms_obj_arr){
            output_str = "";
            terms_obj_arr.forEach(char => {
                this.print_in_txtbox(char + ";");
            });
            output_str += "\n";

            return output_str;
        },

        rules_to_output_string(rules_obj_arr) {
            output_str = "";
            rules_obj_arr.forEach(rule => {
                temp_rule_string = rule.left + "→" + rule.right + ";";
                output_str += temp_rule_string;    
            });
            output_str += "\n";

            return output_str;
        },

        print_in_txtbox(string) {
            this.res_output += string;
        },

        is_sets_equal(as, bs) {
            // сравнение множеств
            if (as.size !== bs.size) return false;
            for (var a of as) if (!bs.has(a)) return false;
            return true;
        },

        union_sets(setA, setB) {
            // объединение множеств
            var _union = new Set(setA);
            for (var elem of setB) {
                _union.add(elem);
            }

            return _union;
        },

        is_string_of_set_elems(string, set) {
            // проверка все ли символы строки входят в множество
            for (let i = 0; i < string.length; i++) {
                if (!set.has(string[i])) {
                    return false;
                }
            }

            return true;
        },

        is_string_contains_set_elem(string, set) {
            for (let i = 0; i < string.length; i++) {
                if (set.has(string[i])) {
                    return true;
                }
            }

            return false;
        },

        get_elems_poses_array(string, set) {
            let results = new Array();

            for (let i = 0; i < string.length; i += 1) {
                if (set.has(string[i])) {
                    results.push(i);
                }
            }

            return results;
        }
    },

    components: {

    },
};

const app = Vue.createApp(appObj);
app.mount("#app");