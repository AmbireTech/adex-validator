const result = Promise.resolve().then(function(){
    console.log(2)
    return 2
})
console.log(result)
console.log(3)