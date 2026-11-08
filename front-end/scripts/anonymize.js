// Synthetic-data substitution map (org policy: no real names). Longest keys first.
module.exports = s => s
 .replace(/Jordan Avery/g,'Jordan Avery').replace(/S\. Avery/g,'J. Avery').replace(/Jordan M\./g,'Jordan A.').replace(/Avery/g,'Avery')
 .replace(/Owen Hart/g,'Owen Hart').replace(/O\. Hart/g,'O. Hart').replace(/Hart/g,'Hart')
 .replace(/Sam Hayes/g,'Sam Hayes').replace(/\bSam Hayes\b/g,'Sam Hayes').replace(/\bJordan\b/g,'Jordan');
