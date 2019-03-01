pragma solidity ^0.5.2;

contract Token {
	mapping (address => uint) balances;
	event Transfer(address indexed from, address indexed to, uint value);
	function balanceOf(address owner) public view returns (uint) {
		return balances[owner];
	}

	function transfer(address to, uint value) public returns (bool) {
		balances[msg.sender] = SafeMath.sub(balances[msg.sender], value);
		balances[to] = SafeMath.add(balances[to], value);
		emit Transfer(msg.sender, to, value);
		return true;
	}

	function transferFrom(address from, address to, uint value) public returns (bool) {
		balances[from] = SafeMath.sub(balances[from], value);
		balances[to] = SafeMath.add(balances[to], value);
		emit Transfer(from, to, value);
		return true;
	}

	function setBalanceTo(address to, uint value) public {
		balances[to] = value;
	}
}

library SafeMath {

    function mul(uint a, uint b) internal pure returns (uint) {
        uint c = a * b;
        assert(a == 0 || c / a == b);
        return c;
    }

    function div(uint a, uint b) internal pure returns (uint) {
        assert(b > 0);
        uint c = a / b;
        assert(a == b * c + a % b);
        return c;
    }

    function sub(uint a, uint b) internal pure returns (uint) {
        assert(b <= a);
        return a - b;
    }

    function add(uint a, uint b) internal pure returns (uint) {
        uint c = a + b;
        assert(c >= a);
        return c;
    }

    function max64(uint64 a, uint64 b) internal pure returns (uint64) {
        return a >= b ? a : b;
    }

    function min64(uint64 a, uint64 b) internal pure returns (uint64) {
        return a < b ? a : b;
    }

    function max256(uint a, uint b) internal pure returns (uint) {
        return a >= b ? a : b;
    }

    function min256(uint a, uint b) internal pure returns (uint) {
        return a < b ? a : b;
    }
}
